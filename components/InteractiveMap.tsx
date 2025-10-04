'use client';

import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import { useEffect, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { GeoJsonObject } from 'geojson';
import type { Layer, Feature } from 'leaflet';
import { LeafletEvent } from 'leaflet';

interface InteractiveMapProps {
  center: [number, number];
  zoom: number;
  onCountrySelect: (countryName: string, bounds: [number, number, number, number]) => void;
}

// Helper component to update map view
const MapUpdater = ({ center, zoom }: Pick<InteractiveMapProps, 'center' | 'zoom'>) => {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom);
  }, [center, zoom, map]);
  return null;
};

const InteractiveMap = ({ center, zoom, onCountrySelect }: InteractiveMapProps) => {
  const [geoJsonData, setGeoJsonData] = useState<GeoJsonObject | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/countries.geojson');
        const data = await response.json();
        setGeoJsonData(data);
      } catch (error) {
        console.error("Failed to fetch GeoJSON data:", error);
      }
    };
    fetchData();
  }, []);

  const defaultStyle = {
    fillColor: '#3388ff',
    weight: 2,
    opacity: 1,
    color: 'white',
    fillOpacity: 0.5,
  };

  const highlightStyle = {
    fillColor: '#ff7800',
    weight: 3,
    color: '#ff7800',
    fillOpacity: 0.7,
  };

  const onEachFeature = (feature: Feature, layer: Layer) => {
    layer.on({
      mouseover: (event: LeafletEvent) => {
        event.target.setStyle(highlightStyle);
      },
      mouseout: (event: LeafletEvent) => {
        (event.target as any).setStyle(defaultStyle);
      },
      click: (event: LeafletEvent) => {
        const bounds = event.target.getBounds();
        event.target._map.fitBounds(bounds);
        const countryName = feature.properties.name;
        const boundingBox: [number, number, number, number] = [
          bounds.getWest(),
          bounds.getSouth(),
          bounds.getEast(),
          bounds.getNorth()
        ];
        onCountrySelect(countryName, boundingBox);
      },
    });
  };

  return (
    <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }}>
      <MapUpdater center={center} zoom={zoom} />
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      {geoJsonData && (
        <GeoJSON
          data={geoJsonData}
          style={defaultStyle}
          onEachFeature={onEachFeature}
        />
      )}
    </MapContainer>
  );
};

export default InteractiveMap;