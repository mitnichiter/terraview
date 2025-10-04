'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const InteractiveMap = dynamic(() => import('@/components/InteractiveMap'), {
  ssr: false,
});

export default function MapsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [mapCenter, setMapCenter] = useState<[number, number]>([20, 0]);
  const [mapZoom, setMapZoom] = useState(2);

  const handleSearch = async () => {
    if (!searchQuery) return;

    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${searchQuery}`);
      const data = await response.json();
      if (data && data.length > 0) {
        const { lat, lon } = data[0];
        setMapCenter([parseFloat(lat), parseFloat(lon)]);
        setMapZoom(6); // Zoom in on the searched location
      } else {
        alert('Location not found');
      }
    } catch (error) {
      console.error('Failed to fetch from Nominatim API:', error);
      alert('Failed to search for location.');
    }
  };

  return (
    <main className="relative">
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] w-full max-w-sm flex space-x-2 p-2 bg-background/80 rounded-lg shadow-lg backdrop-blur-sm">
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
      <InteractiveMap center={mapCenter} zoom={mapZoom} />
    </main>
  );
}