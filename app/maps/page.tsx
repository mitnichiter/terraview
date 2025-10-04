'use client';

import dynamic from 'next/dynamic';
import { useState, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { JobStatus } from '@/lib/jobStore';

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
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [animationUrl, setAnimationUrl] = useState<string | null>(null);
  const pollingInterval = useRef<NodeJS.Timeout | null>(null);

  const handleSearch = async () => {
    if (!searchQuery) return;
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${searchQuery}`);
      const data = await response.json();
      if (data && data.length > 0) {
        const { lat, lon } = data[0];
        setMapCenter([parseFloat(lat), parseFloat(lon)]);
        setMapZoom(6);
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

  const handleGenerateAnimation = async (event: AiEvent) => {
    if (!selectedEventBounds) {
      alert("No location bounds available to generate animation.");
      return;
    }

    setIsDialogOpen(true);
    setJobStatus('processing');
    setAnimationUrl(null);

    try {
      const response = await fetch('/api/animate/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boundingBox: selectedEventBounds,
          startDate: event.startDate,
          endDate: event.endDate,
        }),
      });

      const { jobId } = await response.json();
      setJobId(jobId);
      startPolling(jobId);

    } catch (error) {
      console.error('Failed to request animation:', error);
      alert('Failed to start animation generation.');
      setIsDialogOpen(false);
    }
  };

  const startPolling = (currentJobId: string) => {
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current);
    }

    pollingInterval.current = setInterval(async () => {
      try {
        const response = await fetch(`/api/animate/status?jobId=${currentJobId}`);
        const data = await response.json();

        setJobStatus(data.status);

        if (data.status === 'complete' || data.status === 'failed') {
          if (pollingInterval.current) clearInterval(pollingInterval.current);
          if (data.status === 'complete') {
            setAnimationUrl(data.url);
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
        if (pollingInterval.current) clearInterval(pollingInterval.current);
      }
    }, 3000);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current);
    }
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
                        <Button
                          className="w-full mt-4"
                          onClick={() => handleGenerateAnimation(event)}
                        >
                          Generate Animation
                        </Button>
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
          <div>
            {jobStatus === 'processing' && (
              <div className="flex flex-col items-center justify-center p-8">
                <p>Your animation is being created...</p>
                <p className="text-sm text-muted-foreground">This may take a few moments.</p>
              </div>
            )}
            {jobStatus === 'complete' && animationUrl && (
              <div>
                <h3 className="text-lg font-medium mb-2">Animation Ready!</h3>
                <img src={animationUrl} alt="Generated Animation" className="w-full rounded-md" />
              </div>
            )}
            {jobStatus === 'failed' && (
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