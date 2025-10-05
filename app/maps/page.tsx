'use client';

import dynamic from 'next/dynamic';
import { useState, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const InteractiveMap = dynamic(() => import('@/components/InteractiveMap'), {
  ssr: false,
});

interface AiEvent {
  eventName: string;
  narrative: string;
  eventType: string;
  startDate: string;
  endDate: string;
}

type AnimationStatus = 'idle' | 'loading' | 'success' | 'error';

export default function MapsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [mapCenter, setMapCenter] = useState<[number, number]>([20, 0]);
  const [mapZoom, setMapZoom] = useState(2);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [events, setEvents] = useState<AiEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [selectedEventBounds, setSelectedEventBounds] = useState<[number, number, number, number] | null>(null);

  // Animation state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [animationStatus, setAnimationStatus] = useState<AnimationStatus>('idle');
  const [animationUrl, setAnimationUrl] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerInterval = useRef<NodeJS.Timeout | null>(null);

  const handleSearch = async () => {
    if (!searchQuery) return;
    try {
      // Add addressdetails to get a structured address
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${searchQuery}&addressdetails=1`);
      const data = await response.json();

      if (data && data.length > 0) {
        const result = data[0];
        const { lat, lon, display_name } = result;

        // Nominatim provides boundingbox as [south, north, west, east]
        const [s, n, w, e] = result.boundingbox.map(parseFloat);
        const bounds: [number, number, number, number] = [w, s, e, n];

        setMapCenter([parseFloat(lat), parseFloat(lon)]);
        setMapZoom(8); // Zoom in a bit closer for cities/regions

        // Trigger the same event fetching logic as clicking a country
        const locationName = result.address.city || result.address.state || display_name;
        handleCountrySelect(locationName, bounds);

      } else {
        alert('Location not found');
      }
    } catch (error) {
      console.error('Failed to fetch from Nominatim API:', error);
      alert('Failed to search for location.');
    }
  };

  const handleCountrySelect = async (countryName: string, bounds: [number, number, number, number]) => {
    setSelectedCountry(countryName);
    setEvents([]);
    setIsLoadingEvents(true);
    setSelectedEventBounds(bounds); // Save bounds for animation request

    try {
      const response = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationName: countryName }),
      });
      if (!response.ok) {
        throw new Error('Failed to fetch events');
      }
      const data = await response.json();
      setEvents(data);
    } catch (error) {
      console.error(error);
      alert(`Could not fetch events for ${countryName}.`);
    } finally {
      setIsLoadingEvents(false);
    }
  };

  const handleGenerateAnimation = async (event: AiEvent, recipeName: string) => {
    if (!selectedEventBounds) {
      alert("No location bounds available to generate animation.");
      return;
    }

    // Reset state and open dialog
    setIsDialogOpen(true);
    setAnimationStatus('loading');
    setAnimationUrl(null);
    setElapsedTime(0);

    // Start the elapsed time timer
    if (timerInterval.current) clearInterval(timerInterval.current);
    timerInterval.current = setInterval(() => {
      setElapsedTime(prevTime => prevTime + 1);
    }, 1000);

    try {
      const response = await fetch('/api/gee/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boundingBox: selectedEventBounds,
          startDate: event.startDate,
          endDate: event.endDate,
          recipeName,
        }),
      });

      if (timerInterval.current) clearInterval(timerInterval.current);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Failed to generate animation.');
      }

      const { animationUrl } = await response.json();
      setAnimationUrl(animationUrl);
      setAnimationStatus('success');

    } catch (error) {
      console.error('Failed to request animation:', error);
      setAnimationStatus('error');
      if (timerInterval.current) clearInterval(timerInterval.current);
      // The dialog will show the error state, no need for an alert.
    }
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    if (timerInterval.current) clearInterval(timerInterval.current);
  }

  const formatElapsedTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[400px_1fr] h-screen">
      {/* Left Panel */}
      <div className="bg-background border-r overflow-y-auto p-4 flex flex-col">
        <Card className="flex-grow flex flex-col">
          <CardHeader>
            <CardTitle>TerraView</CardTitle>
            <CardDescription>Select a country or search to discover significant environmental events.</CardDescription>
          </CardHeader>
          <CardContent className="flex-grow flex flex-col">
            <div className="flex space-x-2">
              <Input
                type="text"
                placeholder="Search for a location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="flex-grow"
              />
              <Button onClick={handleSearch}>Search</Button>
            </div>
            <div className="mt-6 flex-grow">
              {selectedCountry && <h2 className="text-xl font-semibold mb-2">Events in {selectedCountry}</h2>}
              {isLoadingEvents ? (
                <div className="space-y-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : (
                <Accordion type="single" collapsible className="w-full">
                  {events.map((event, index) => (
                    <AccordionItem value={`item-${index}`} key={index}>
                      <AccordionTrigger>{event.eventName}</AccordionTrigger>
                      <AccordionContent>
                        <p className="mb-4">{event.narrative}</p>
                        <p className="text-sm text-muted-foreground">
                          {event.startDate} to {event.endDate}
                        </p>
                        <div className="flex flex-col space-y-2 mt-4">
                          <Button
                            variant="secondary"
                            onClick={() => handleGenerateAnimation(event, 'trueColorRecipe')}
                          >
                            View True Color
                          </Button>
                          {event.eventType === 'Wildfire' && (
                             <Button
                              variant="destructive"
                              onClick={() => handleGenerateAnimation(event, 'wildfireRecipe')}
                            >
                              Analyze Fire Impact
                            </Button>
                          )}
                          {event.eventType === 'Flood' && (
                             <Button
                              variant="default"
                              onClick={() => handleGenerateAnimation(event, 'floodRecipe')}
                            >
                              Map Flood Extent (NDWI)
                            </Button>
                          )}
                           {(event.eventType === 'Drought' || event.eventType === 'Vegetation') && (
                             <Button
                              variant="success"
                              onClick={() => handleGenerateAnimation(event, 'vegetationRecipe')}
                            >
                              Analyze Vegetation (NDVI)
                            </Button>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Panel (Map) */}
      <div className="h-full w-full">
        <InteractiveMap center={mapCenter} zoom={mapZoom} onCountrySelect={handleCountrySelect} />
      </div>

      {/* Animation Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={closeDialog}>
        <DialogContent className="z-[5000]">
          <DialogHeader>
            <DialogTitle>Generating Animation</DialogTitle>
          </DialogHeader>
          <div className="p-6 text-center">
            {animationStatus === 'loading' && (
              <div className="flex flex-col items-center justify-center space-y-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                <p className="text-lg font-semibold">GENERATING...</p>
                <p className="text-2xl font-mono">{formatElapsedTime(elapsedTime)}</p>
                <p className="text-sm text-muted-foreground">
                  Contacting Google Earth Engine to generate your video.
                  <br />
                  This should be much faster now!
                </p>
              </div>
            )}
            {animationStatus === 'success' && animationUrl && (
              <div>
                <h3 className="text-lg font-medium mb-2">Animation Ready!</h3>
                <video
                  src={animationUrl}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full rounded-md"
                >
                  Your browser does not support the video tag.
                </video>
              </div>
            )}
            {animationStatus === 'error' && (
              <div className="text-red-500">
                <h3 className="text-lg font-medium mb-2">Animation Failed</h3>
                <p>Unfortunately, there was an error generating the animation.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}