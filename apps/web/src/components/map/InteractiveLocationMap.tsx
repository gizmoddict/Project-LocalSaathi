'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  MapPin,
  Navigation,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Compass,
  ZoomIn,
  ZoomOut,
  RefreshCw,
} from 'lucide-react';
import type { Map as LeafletMap, Marker as LeafletMarker, Circle as LeafletCircle } from 'leaflet';
import { useDeviceLocation } from '@/hooks/useDeviceLocation';
import {
  searchPlaces,
  reverseGeocode,
  getMapTileConfig,
  GeocodingResult,
} from '@/lib/geocoding';
import type { DiscoveredJobItem } from '@localsaathi/types';
import { useTranslation } from '@/i18n/context';

export interface InteractiveLocationMapProps {
  initialCenter?: { latitude: number; longitude: number };
  savedLocation?: {
    latitude?: number;
    longitude?: number;
    locality?: string | null;
    city?: string | null;
    addressLine?: string | null;
    pinCode?: string | null;
    state?: string | null;
  } | null;
  radiusKm?: number;
  onRadiusChange?: (radiusKm: number) => void;
  onConfirmLocation?: (location: GeocodingResult, radiusKm: number) => Promise<void> | void;
  onSearchThisArea?: (center: { latitude: number; longitude: number }, radiusKm: number) => void;
  jobs?: DiscoveredJobItem[];
  selectedJobId?: string | null;
  onSelectJob?: (jobId: string) => void;
  isConfirming?: boolean;
  className?: string;
  height?: string;
  readOnly?: boolean;
}

const SUPPORTED_RADII = [5, 10, 25, 50];
const DEFAULT_LUCKNOW = { latitude: 26.8500, longitude: 80.9480 }; // Lucknow Hazratganj

export function InteractiveLocationMap({
  initialCenter,
  savedLocation,
  radiusKm = 10,
  onRadiusChange,
  onConfirmLocation,
  onSearchThisArea,
  jobs = [],
  selectedJobId,
  onSelectJob,
  isConfirming = false,
  className = '',
  height = '480px',
  readOnly = false,
}: InteractiveLocationMapProps) {
  const { t } = useTranslation();
  const [isMounted, setIsMounted] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<LeafletMap | null>(null);
  const centerMarkerRef = useRef<LeafletMarker | null>(null);
  const radiusCircleRef = useRef<LeafletCircle | null>(null);
  const jobMarkersMapRef = useRef<Map<string, LeafletMarker>>(new Map());

  // Determine initial coordinates: initialCenter -> savedLocation -> default
  const defaultLat = initialCenter?.latitude ?? savedLocation?.latitude ?? DEFAULT_LUCKNOW.latitude;
  const defaultLon = initialCenter?.longitude ?? savedLocation?.longitude ?? DEFAULT_LUCKNOW.longitude;

  const [currentCoords, setCurrentCoords] = useState<{ latitude: number; longitude: number }>({
    latitude: defaultLat,
    longitude: defaultLon,
  });

  const [selectedAddress, setSelectedAddress] = useState<GeocodingResult>({
    latitude: defaultLat,
    longitude: defaultLon,
    displayName: savedLocation?.locality
      ? `${savedLocation.locality}, ${savedLocation.city || ''}`
      : 'Hazratganj, Lucknow, Uttar Pradesh',
    locality: savedLocation?.locality || 'Hazratganj',
    city: savedLocation?.city || 'Lucknow',
    state: savedLocation?.state || 'Uttar Pradesh',
    pinCode: savedLocation?.pinCode || '226001',
    addressLine: savedLocation?.addressLine || 'Hazratganj Market',
  });

  // UI state
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodingResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [hasMapMoved, setHasMapMoved] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [confirmSuccess, setConfirmSuccess] = useState(false);

  // Browser Geolocation hook
  const {
    status: geoStatus,
    errorMessage: geoErrorMessage,
    requestLocation,
    resetStatus: resetGeoStatus,
  } = useDeviceLocation();

  // Check if current selection matches saved profile location
  const isSavedLocation = Boolean(
    savedLocation?.latitude !== undefined &&
    savedLocation?.longitude !== undefined &&
    Math.abs(currentCoords.latitude - (savedLocation.latitude || 0)) < 0.0005 &&
    Math.abs(currentCoords.longitude - (savedLocation.longitude || 0)) < 0.0005
  );

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // ---------------------------------------------------------------------------
  // Address Resolution
  // ---------------------------------------------------------------------------
  const updateAddressForCoords = useCallback(async (lat: number, lon: number) => {
    setIsResolvingAddress(true);
    setConfirmSuccess(false);
    try {
      const resolved = await reverseGeocode(lat, lon);
      setSelectedAddress(resolved);
    } catch {
      setSelectedAddress({
        latitude: lat,
        longitude: lon,
        displayName: `Coordinates: ${lat.toFixed(4)}, ${lon.toFixed(4)}`,
        locality: 'Custom Location',
        city: 'Local Area',
      });
    } finally {
      setIsResolvingAddress(false);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Leaflet Map Initialization
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isMounted || !mapContainerRef.current) return;

    let isDestroyed = false;

    // Dynamically load Leaflet on client
    import('leaflet').then((L) => {
      if (isDestroyed || !mapContainerRef.current) return;

      // Clean up previous map instance if exists
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }

      const tileConfig = getMapTileConfig();

      const map = L.map(mapContainerRef.current, {
        center: [currentCoords.latitude, currentCoords.longitude],
        zoom: 13,
        zoomControl: false,
      });

      leafletMapRef.current = map;

      // Add actual map tiles
      L.tileLayer(tileConfig.tileUrl, {
        attribution: tileConfig.attribution,
        subdomains: tileConfig.subdomains,
        maxZoom: tileConfig.maxZoom,
        minZoom: tileConfig.minZoom,
      }).addTo(map);

      // Custom Center Location Marker Icon
      const centerPinIcon = L.divIcon({
        className: 'custom-map-center-pin',
        html: `
          <div style="position: relative; width: 36px; height: 36px; transform: translate(-50%, -100%); cursor: grab;">
            <div style="position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); width: 14px; height: 4px; background: rgba(0,0,0,0.25); border-radius: 50%; filter: blur(1px);"></div>
            <div style="width: 36px; height: 36px; display: flex; items-center; justify-content: center; background: #173b2f; color: #ffffff; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); box-shadow: 0 4px 12px rgba(23,59,47,0.4); border: 2.5px solid #ffffff;">
              <div style="transform: rotate(45deg); display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e2bd80" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
              </div>
            </div>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 36],
      });

      // Add center draggable marker
      const marker = L.marker([currentCoords.latitude, currentCoords.longitude], {
        icon: centerPinIcon,
        draggable: !readOnly,
        title: 'Selected Work Location (Drag to adjust)',
      }).addTo(map);

      centerMarkerRef.current = marker;

      // Add Radius Coverage Circle
      const radiusCircle = L.circle([currentCoords.latitude, currentCoords.longitude], {
        radius: radiusKm * 1000,
        color: '#28734f',
        fillColor: '#28734f',
        fillOpacity: 0.08,
        weight: 1.5,
        dashArray: '5, 5',
      }).addTo(map);

      radiusCircleRef.current = radiusCircle;

      // Handle marker drag
      if (!readOnly) {
        marker.on('dragend', () => {
          const latLng = marker.getLatLng();
          const newLat = Number(latLng.lat.toFixed(6));
          const newLon = Number(latLng.lng.toFixed(6));
          setCurrentCoords({ latitude: newLat, longitude: newLon });
          radiusCircle.setLatLng(latLng);
          setHasMapMoved(true);
          updateAddressForCoords(newLat, newLon);
        });

        // Handle map click to place marker
        map.on('click', (e) => {
          const newLat = Number(e.latlng.lat.toFixed(6));
          const newLon = Number(e.latlng.lng.toFixed(6));
          marker.setLatLng(e.latlng);
          radiusCircle.setLatLng(e.latlng);
          setCurrentCoords({ latitude: newLat, longitude: newLon });
          setHasMapMoved(true);
          updateAddressForCoords(newLat, newLon);
        });

        // Handle map pan / zoom to show "Search This Area"
        map.on('moveend', () => {
          const center = map.getCenter();
          const dist = Math.sqrt(
            Math.pow(center.lat - currentCoords.latitude, 2) +
            Math.pow(center.lng - currentCoords.longitude, 2)
          );
          if (dist > 0.015) {
            setHasMapMoved(true);
          }
        });
      }
    });

    return () => {
      isDestroyed = true;
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, [isMounted]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Synchronize Radius Circle with radiusKm
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (radiusCircleRef.current) {
      radiusCircleRef.current.setRadius(radiusKm * 1000);
    }
  }, [radiusKm]);

  // ---------------------------------------------------------------------------
  // Render and Synchronize Job Markers on Map
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isMounted || !leafletMapRef.current) return;

    import('leaflet').then((L) => {
      const map = leafletMapRef.current;
      if (!map) return;

      // Clean up previous job markers
      jobMarkersMapRef.current.forEach((marker) => marker.remove());
      jobMarkersMapRef.current.clear();

      jobs.forEach((job) => {
        const lat = job.location?.latitude;
        const lon = job.location?.longitude;

        if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) {
          return;
        }

        const isSelected = job.id === selectedJobId;
        const isUrgent = job.urgency === 'IMMEDIATE';
        const isHighMatch = job.match?.score >= 80;

        const pinColor = isSelected ? '#173b2f' : isUrgent ? '#e11d48' : '#28734f';
        const badgeColor = isSelected ? '#e2bd80' : '#ffffff';

        const jobIcon = L.divIcon({
          className: `custom-job-pin ${isSelected ? 'selected-pin' : ''}`,
          html: `
            <div style="position: relative; width: 32px; height: 32px; transform: translate(-50%, -100%); cursor: pointer; transition: transform 0.2s;">
              <div style="position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); width: 12px; height: 3px; background: rgba(0,0,0,0.2); border-radius: 50%;"></div>
              <div style="
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: ${pinColor};
                color: ${badgeColor};
                border-radius: ${isSelected ? '50% 50% 50% 0' : '10px'};
                transform: ${isSelected ? 'rotate(-45deg)' : 'none'};
                box-shadow: 0 4px 10px rgba(0,0,0,0.25);
                border: 2px solid #ffffff;
              ">
                <div style="transform: ${isSelected ? 'rotate(45deg)' : 'none'}; font-size: 11px; font-weight: bold; display: flex; align-items: center; justify-content: center;">
                  ₹
                </div>
              </div>
              ${
                isHighMatch
                  ? `<div style="position: absolute; top: -4px; right: -4px; width: 10px; height: 10px; background: #10b981; border: 1.5px solid #ffffff; border-radius: 50%;"></div>`
                  : ''
              }
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 32],
        });

        const jobMarker = L.marker([lat, lon], {
          icon: jobIcon,
          title: `${job.title} (₹${job.wageAmount})`,
        }).addTo(map);

        // Click popup with job summary
        const popupContent = document.createElement('div');
        popupContent.className = 'p-1 text-slate-800 text-xs font-sans';
        popupContent.innerHTML = `
          <div style="font-weight: 700; font-size: 13px; margin-bottom: 2px; color: #18382c;">${escapeHtml(job.title)}</div>
          <div style="color: #64748b; margin-bottom: 6px;">🏢 ${escapeHtml(job.employer.businessName)} • 📍 ${escapeHtml(job.location.locality || job.location.city)}</div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-weight: 800; font-size: 14px; color: #173b2f;">₹${job.wageAmount} <span style="font-size: 10px; font-weight: normal; color: #64748b;">/${job.wageType.toLowerCase()}</span></span>
            <span style="background: #edf4ed; color: #28734f; padding: 2px 6px; border-radius: 12px; font-size: 10px; font-weight: 600;">${job.distanceKm} km away</span>
          </div>
          <div style="display: flex; gap: 4px;">
            <button id="view-job-${job.id}" style="width: 100%; background: #173b2f; color: #ffffff; padding: 5px 8px; border-radius: 6px; border: none; font-size: 11px; font-weight: 700; cursor: pointer;">
              Select & View Job
            </button>
          </div>
        `;

        jobMarker.bindPopup(popupContent, { maxWidth: 240, minWidth: 200 });

        jobMarker.on('click', () => {
          onSelectJob?.(job.id);
        });

        jobMarker.on('popupopen', () => {
          const btn = document.getElementById(`view-job-${job.id}`);
          if (btn) {
            btn.onclick = () => {
              onSelectJob?.(job.id);
            };
          }
        });

        jobMarkersMapRef.current.set(job.id, jobMarker);
      });
    });
  }, [jobs, selectedJobId, isMounted, onSelectJob]);

  // ---------------------------------------------------------------------------
  // Focus map on selected job when selected from list
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!selectedJobId || !leafletMapRef.current) return;
    const marker = jobMarkersMapRef.current.get(selectedJobId);
    if (marker) {
      const latLng = marker.getLatLng();
      leafletMapRef.current.panTo(latLng, { animate: true, duration: 0.5 });
      marker.openPopup();
    }
  }, [selectedJobId]);

  // ---------------------------------------------------------------------------
  // Geolocation Click Handler
  // ---------------------------------------------------------------------------
  const handleUseCurrentLocation = async () => {
    setMapError(null);
    resetGeoStatus();

    const coords = await requestLocation();
    if (!coords) return;

    setCurrentCoords(coords);
    setHasMapMoved(false);

    if (leafletMapRef.current) {
      leafletMapRef.current.setView([coords.latitude, coords.longitude], 14, { animate: true });
    }
    if (centerMarkerRef.current) {
      centerMarkerRef.current.setLatLng([coords.latitude, coords.longitude]);
    }
    if (radiusCircleRef.current) {
      radiusCircleRef.current.setLatLng([coords.latitude, coords.longitude]);
    }

    await updateAddressForCoords(coords.latitude, coords.longitude);
  };

  // ---------------------------------------------------------------------------
  // Place Search & Autocomplete
  // ---------------------------------------------------------------------------
  const handleSearchChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);

    if (val.trim().length >= 2) {
      setIsSearching(true);
      setShowSearchDropdown(true);
      try {
        const results = await searchPlaces(val);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    } else {
      setSearchResults([]);
      setShowSearchDropdown(false);
    }
  };

  const handleSelectSearchResult = (result: GeocodingResult) => {
    setSearchQuery('');
    setShowSearchDropdown(false);
    setCurrentCoords({ latitude: result.latitude, longitude: result.longitude });
    setSelectedAddress(result);
    setHasMapMoved(false);

    if (leafletMapRef.current) {
      leafletMapRef.current.setView([result.latitude, result.longitude], 14, { animate: true });
    }
    if (centerMarkerRef.current) {
      centerMarkerRef.current.setLatLng([result.latitude, result.longitude]);
    }
    if (radiusCircleRef.current) {
      radiusCircleRef.current.setLatLng([result.latitude, result.longitude]);
    }
  };

  // ---------------------------------------------------------------------------
  // "Search This Area" Handler
  // ---------------------------------------------------------------------------
  const handleSearchThisArea = () => {
    if (!leafletMapRef.current) return;
    const center = leafletMapRef.current.getCenter();
    const lat = Number(center.lat.toFixed(6));
    const lon = Number(center.lng.toFixed(6));

    setCurrentCoords({ latitude: lat, longitude: lon });
    if (centerMarkerRef.current) centerMarkerRef.current.setLatLng([lat, lon]);
    if (radiusCircleRef.current) radiusCircleRef.current.setLatLng([lat, lon]);

    setHasMapMoved(false);
    updateAddressForCoords(lat, lon);
    onSearchThisArea?.({ latitude: lat, longitude: lon }, radiusKm);
  };

  // ---------------------------------------------------------------------------
  // Confirm Location Handler
  // ---------------------------------------------------------------------------
  const handleConfirmLocation = async () => {
    if (readOnly || isConfirming) return;
    setMapError(null);
    try {
      await onConfirmLocation?.(selectedAddress, radiusKm);
      setConfirmSuccess(true);
      setTimeout(() => setConfirmSuccess(false), 4000);
    } catch (err: any) {
      setMapError(err?.message || 'Failed to persist confirmed location.');
    }
  };

  // Zoom controls
  const handleZoomIn = () => leafletMapRef.current?.zoomIn();
  const handleZoomOut = () => leafletMapRef.current?.zoomOut();

  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-2xl border border-[#d8e2d8] bg-white shadow-sm ${className}`}
      data-testid="interactive-location-map"
    >
      {/* Top Floating Controls Bar */}
      <div className="absolute top-3 left-3 right-3 z-[1000] flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pointer-events-none">
        {/* Search Place Input Box */}
        <div className="relative w-full sm:max-w-xs pointer-events-auto shadow-md rounded-xl">
          <div className="relative flex items-center">
            <Search className="absolute left-3 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search area, city or PIN code…"
              value={searchQuery}
              onChange={handleSearchChange}
              onFocus={() => searchQuery.length >= 2 && setShowSearchDropdown(true)}
              className="w-full rounded-xl border border-slate-200 bg-white/95 py-2 pl-9 pr-8 text-xs font-semibold text-slate-800 placeholder-slate-400 backdrop-blur-md focus:border-[#28734f] focus:outline-none focus:ring-2 focus:ring-[#28734f]/20 shadow-sm"
              aria-label="Search map location"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setShowSearchDropdown(false);
                }}
                className="absolute right-2.5 p-0.5 text-slate-400 hover:text-slate-600"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Autocomplete Dropdown */}
          {showSearchDropdown && (
            <div className="absolute left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl z-[1001]">
              {isSearching ? (
                <div className="p-3 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#28734f]" />
                  Searching places…
                </div>
              ) : searchResults.length === 0 ? (
                <div className="p-3 text-center text-xs text-slate-500">
                  No places found. Try another city or trade area.
                </div>
              ) : (
                searchResults.map((res, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSelectSearchResult(res)}
                    className="flex w-full items-start gap-2.5 px-3 py-2 text-left text-xs transition hover:bg-[#f2f7f3] border-b border-slate-50 last:border-none"
                  >
                    <MapPin className="h-4 w-4 shrink-0 text-[#28734f] mt-0.5" />
                    <div>
                      <div className="font-bold text-slate-800">
                        {res.locality || res.city || 'Area'}
                      </div>
                      <div className="text-[11px] text-slate-500 line-clamp-1">
                        {res.displayName}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Action Buttons: "Search This Area" & "Use My Current Location" */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {hasMapMoved && onSearchThisArea && (
            <button
              type="button"
              onClick={handleSearchThisArea}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#28734f] bg-[#173b2f] px-3 py-2 text-xs font-bold text-white shadow-lg transition hover:bg-[#235845] active:scale-95"
              aria-label={t('map.searchThisArea')}
            >
              <RefreshCw className="h-3.5 w-3.5 animate-spin-once" />
              {t('map.searchThisArea')}
            </button>
          )}

          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={geoStatus === 'requesting'}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs font-bold text-slate-700 shadow-md backdrop-blur-md transition hover:border-[#b8d0bc] hover:bg-[#f8faf7] active:scale-95 disabled:opacity-50"
            title={t('map.useCurrentLocation')}
            aria-label={t('map.useCurrentLocation')}
          >
            {geoStatus === 'requesting' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#28734f]" />
            ) : (
              <Navigation className="h-3.5 w-3.5 text-[#28734f]" />
            )}
            <span className="hidden sm:inline">{t('map.useCurrentLocation')}</span>
            <span className="sm:hidden">GPS</span>
          </button>
        </div>
      </div>

      {/* Permission Denied / Error Alert Bar */}
      {(geoStatus === 'denied' || geoStatus === 'unavailable') && (
        <div className="absolute top-14 left-3 right-3 z-[1000] flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 shadow-md">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>{geoErrorMessage || 'GPS permission denied. You can manually pan the map or search an area.'}</span>
          </div>
          <button
            type="button"
            onClick={resetGeoStatus}
            className="p-1 text-amber-700 hover:text-amber-900"
            aria-label="Dismiss alert"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Map Canvas */}
      <div
        ref={mapContainerRef}
        style={{ height }}
        className="w-full bg-[#f4f7f4] cursor-grab active:cursor-grabbing"
      />

      {/* Floating Zoom Controls */}
      <div className="absolute bottom-24 right-3 z-[1000] flex flex-col rounded-xl border border-slate-200 bg-white shadow-md overflow-hidden">
        <button
          type="button"
          onClick={handleZoomIn}
          className="p-2 text-slate-600 hover:bg-slate-50 border-b border-slate-100"
          aria-label="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          className="p-2 text-slate-600 hover:bg-slate-50"
          aria-label="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
      </div>

      {/* Bottom Information & Confirmation Bar */}
      <div className="border-t border-[#e2e7df] bg-[#fbfcfa] p-3.5 sm:p-4 space-y-3 z-[1000]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Selected Address Display */}
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#edf4ed] text-[#28734f]">
              <MapPin className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-slate-900 text-xs sm:text-sm truncate">
                  {isResolvingAddress
                    ? 'Resolving address…'
                    : selectedAddress.locality || selectedAddress.city || 'Custom Pin Location'}
                </span>

                {/* Saved vs Temporary Indicator */}
                {isSavedLocation ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-300">
                    <CheckCircle2 className="h-3 w-3" />
                    {t('common.saved')}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-300">
                    <Compass className="h-3 w-3" />
                    {t('common.temporary')}
                  </span>
                )}
              </div>

              <p className="text-[11px] text-slate-500 truncate mt-0.5">
                {selectedAddress.displayName}
              </p>
            </div>
          </div>

          {/* Radius Selector Pills */}
          {onRadiusChange && (
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] font-bold text-slate-600 mr-1 hidden md:inline">
                {t('jobs.radiusLabel')}:
              </span>
              {SUPPORTED_RADII.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => onRadiusChange(r)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                    radiusKm === r
                      ? 'bg-[#173b2f] text-white shadow-sm'
                      : 'border border-slate-200 bg-white text-slate-600 hover:border-[#b8d0bc] hover:bg-[#f8faf7]'
                  }`}
                  aria-label={`${r} ${t('common.km')}`}
                >
                  {r} {t('common.km')}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Action Row: Confirm Button & Status Feedback */}
        {!readOnly && onConfirmLocation && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-2 border-t border-slate-100">
            <div className="text-[11px] text-slate-500">
              {isSavedLocation ? (
                <span className="text-emerald-700 font-medium">
                  ✓ {t('map.savedLocationNotice')}
                </span>
              ) : (
                <span>
                  {t('map.dragPinHint')}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              {confirmSuccess && (
                <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4" /> {t('map.locationSaved')}
                </span>
              )}
              {mapError && (
                <span className="text-xs font-semibold text-rose-600 flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" /> {mapError}
                </span>
              )}

              <button
                type="button"
                onClick={handleConfirmLocation}
                disabled={isConfirming || isResolvingAddress}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#173b2f] px-5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#235845] active:scale-95 disabled:opacity-50"
                aria-label={t('map.confirmLocation')}
              >
                {isConfirming ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t('common.loading')}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {t('map.confirmLocation')}
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function escapeHtml(str: string) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
