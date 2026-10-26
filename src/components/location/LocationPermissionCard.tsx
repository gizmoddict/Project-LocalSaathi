'use client';

import React, { useState } from 'react';
import {
  MapPin,
  Navigation,
  AlertCircle,
  CheckCircle2,
  Loader2,
  X,
  Compass,
  Search,
  Map,
} from 'lucide-react';
import { useDeviceLocation, Coordinates } from '@/hooks/useDeviceLocation';
import { workerApi } from '@/lib/api-client';
import { useTranslation } from '@/i18n/context';
import { LocationPickerModal } from './LocationPickerModal';

export interface LocationPermissionCardProps {
  onLocationSaved?: (location: {
    latitude: number;
    longitude: number;
    locality?: string;
    city?: string;
    preferredRadiusKm?: number;
  }) => void;
  onDismiss?: () => void;
  className?: string;
  savedLocation?: {
    latitude?: number;
    longitude?: number;
    locality?: string | null;
    city?: string | null;
  } | null;
}

// Well-known NCR & UP trade hubs with verified coordinates for manual selection fallback
const SUPPORTED_MANUAL_AREAS = [
  { locality: 'Hazratganj', city: 'Lucknow', state: 'Uttar Pradesh', pinCode: '226001', latitude: 26.85, longitude: 80.948 },
  { locality: 'Aliganj', city: 'Lucknow', state: 'Uttar Pradesh', pinCode: '226024', latitude: 26.89, longitude: 80.94 },
  { locality: 'Gomti Nagar', city: 'Lucknow', state: 'Uttar Pradesh', pinCode: '226010', latitude: 26.86, longitude: 80.99 },
  { locality: 'Indira Nagar', city: 'Lucknow', state: 'Uttar Pradesh', pinCode: '226016', latitude: 26.88, longitude: 80.98 },
  { locality: 'Connaught Place', city: 'New Delhi', state: 'Delhi', pinCode: '110001', latitude: 28.63, longitude: 77.22 },
  { locality: 'Noida Sector 18', city: 'Noida', state: 'Uttar Pradesh', pinCode: '201301', latitude: 28.57, longitude: 77.32 },
];

export function LocationPermissionCard({
  onLocationSaved,
  onDismiss,
  className = '',
  savedLocation,
}: LocationPermissionCardProps) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [manualSearch, setManualSearch] = useState('');
  const [customCity, setCustomCity] = useState('');
  const [customPin, setCustomPin] = useState('');

  const {
    status,
    errorMessage,
    requestLocation,
    resetStatus,
    isSupported,
  } = useDeviceLocation();

  const handleUseCurrentLocation = async () => {
    setSaveError(null);
    setSaveSuccess(false);

    const coords = await requestLocation();
    if (!coords) return;

    await persistLocation(coords);
  };

  const persistLocation = async (coords: Coordinates, locality?: string, city?: string, pinCode?: string, state?: string) => {
    setSaving(true);
    setSaveError(null);

    try {
      const resp = await workerApi.updateLocation({
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracyMeters: coords.accuracyMeters ?? null,
        locality: locality || 'Current Location',
        city: city || 'Local Area',
        state: state || 'Uttar Pradesh',
        pinCode: pinCode || null,
      });

      setSaveSuccess(true);
      if (typeof window !== 'undefined') {
        localStorage.setItem('localsaathi:location_configured', 'true');
      }

      onLocationSaved?.({
        latitude: coords.latitude,
        longitude: coords.longitude,
        locality: resp.locality || locality,
        city: resp.city || city,
      });
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save location to worker profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleSelectManualArea = async (area: typeof SUPPORTED_MANUAL_AREAS[0]) => {
    await persistLocation(
      { latitude: area.latitude, longitude: area.longitude },
      area.locality,
      area.city,
      area.pinCode,
      area.state
    );
  };

  const handleSaveCustomCity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customCity.trim()) return;

    // Default to Lucknow center for manual city if coordinates aren't geocoded
    const defaultCoords = { latitude: 26.8467, longitude: 80.9462 };
    await persistLocation(
      defaultCoords,
      customCity.trim(),
      customCity.trim(),
      customPin.trim() || undefined
    );
  };

  const filteredAreas = SUPPORTED_MANUAL_AREAS.filter(
    (a) =>
      a.locality.toLowerCase().includes(manualSearch.toLowerCase()) ||
      a.city.toLowerCase().includes(manualSearch.toLowerCase()) ||
      a.pinCode.includes(manualSearch)
  );

  return (
    <div
      role="region"
      aria-label="Location Permission and Selection"
      className={`relative overflow-hidden rounded-3xl border border-[#d3dfd5] bg-gradient-to-br from-white to-[#f7f9f6] p-6 shadow-sm sm:p-7 ${className}`}
    >
      {/* Dismiss button */}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss location banner"
          className="absolute right-4 top-4 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      {/* Main Card View */}
      {!isManualOpen ? (
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#edf4ed] text-[#28734f] shadow-inner">
              <MapPin className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-[#18382c] sm:text-xl">
                Find Jobs Near You
              </h2>
              <p className="text-sm text-slate-600 max-w-xl leading-relaxed">
                Allow location access to discover relevant jobs near your current location. We use your location strictly to calculate commute distance and job relevance.
              </p>

              {/* Status & Feedback Notices */}
              {status === 'requesting' && (
                <div className="flex items-center gap-2 pt-1.5 text-xs font-semibold text-[#28734f]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Requesting device location from browser…</span>
                </div>
              )}

              {saving && (
                <div className="flex items-center gap-2 pt-1.5 text-xs font-semibold text-[#28734f]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Saving location to your worker profile…</span>
                </div>
              )}

              {saveSuccess && (
                <div className="flex items-center gap-1.5 pt-1.5 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>Location saved successfully! Updating nearby jobs radar…</span>
                </div>
              )}

              {(errorMessage || saveError) && (
                <div className="flex items-start gap-1.5 pt-2 text-xs font-medium text-rose-700">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                  <span>{errorMessage || saveError}</span>
                </div>
              )}

              {status === 'denied' && (
                <p className="text-xs text-slate-500 pt-1">
                  💡 Tip: Click the padlock or settings icon in your browser address bar to reset location permissions, or choose an area manually below.
                </p>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:shrink-0">
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              disabled={status === 'requesting' || saving || !isSupported}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#173b2f] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#245944] focus:outline-none focus:ring-2 focus:ring-[#28734f] focus:ring-offset-2 disabled:opacity-60"
            >
              {status === 'requesting' || saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{t('map.locating')}</span>
                </>
              ) : (
                <>
                  <Navigation className="h-4 w-4" />
                  <span>{t('map.useCurrentLocation')}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setIsMapModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#28734f] bg-[#edf4ed] px-4 py-3 text-sm font-bold text-[#18382c] shadow-sm transition hover:bg-[#dcebdd] focus:outline-none focus:ring-2 focus:ring-[#28734f]"
            >
              <Map className="h-4 w-4 text-[#28734f]" />
              <span>{t('worker.interactiveMap')}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                resetStatus();
                setIsManualOpen(true);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              <Compass className="h-4 w-4 text-slate-500" />
              <span>{t('common.search')}</span>
            </button>
          </div>
        </div>
      ) : (
        /* Manual Location Selector View */
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <Compass className="h-5 w-5 text-[#28734f]" />
              <h3 className="font-bold text-[#18382c] text-base">Select Your Work Locality</h3>
            </div>
            <button
              type="button"
              onClick={() => setIsManualOpen(false)}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition"
            >
              &larr; Back to GPS
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Filter popular trade hubs by name or PIN…"
              value={manualSearch}
              onChange={(e) => setManualSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs font-medium text-slate-800 placeholder-slate-400 focus:border-[#28734f] focus:outline-none focus:ring-1 focus:ring-[#28734f]"
            />
          </div>

          {/* Quick Select Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {filteredAreas.map((area) => (
              <button
                key={area.locality}
                type="button"
                onClick={() => handleSelectManualArea(area)}
                disabled={saving}
                className="flex flex-col items-start p-3 rounded-xl border border-slate-200 bg-white hover:border-[#28734f] hover:bg-[#f8faf7] transition text-left focus:outline-none focus:ring-2 focus:ring-[#28734f]"
              >
                <span className="text-xs font-bold text-slate-900">{area.locality}</span>
                <span className="text-[11px] text-slate-500">{area.city} ({area.pinCode})</span>
              </button>
            ))}
          </div>

          {/* Custom City Form */}
          <form onSubmit={handleSaveCustomCity} className="flex flex-col sm:flex-row items-center gap-2 pt-2">
            <div className="relative w-full sm:flex-1">
              <input
                type="text"
                placeholder="Enter city or locality (e.g. Kanpur, Varanasi)"
                value={customCity}
                onChange={(e) => setCustomCity(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 placeholder-slate-400 focus:border-[#28734f] focus:outline-none focus:ring-1 focus:ring-[#28734f]"
              />
            </div>
            <div className="w-full sm:w-32">
              <input
                type="text"
                placeholder="PIN Code"
                maxLength={6}
                value={customPin}
                onChange={(e) => setCustomPin(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 placeholder-slate-400 focus:border-[#28734f] focus:outline-none focus:ring-1 focus:ring-[#28734f]"
              />
            </div>
            <button
              type="submit"
              disabled={saving || !customCity.trim()}
              className="w-full sm:w-auto rounded-xl bg-[#173b2f] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#245944] disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Set Area'}
            </button>
          </form>
        </div>
      )}

      {/* Privacy Guarantee Note */}
      <div className="mt-4 border-t border-slate-100 pt-3 text-[11px] text-slate-400 flex items-center justify-between gap-1.5 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-slate-500">🔒 Privacy:</span>
          <span>
            Your exact GPS coordinates are stored privately and used only to calculate job distance. They are never shared publicly or exposed to employers.
          </span>
        </div>
        <button
          type="button"
          onClick={() => setIsMapModalOpen(true)}
          className="text-xs font-bold text-[#28734f] hover:underline flex items-center gap-1"
        >
          <Map className="h-3.5 w-3.5" />
          Open Interactive Map
        </button>
      </div>

      {/* Interactive Location Picker Modal */}
      <LocationPickerModal
        isOpen={isMapModalOpen}
        onClose={() => setIsMapModalOpen(false)}
        savedLocation={savedLocation}
        onLocationSaved={(loc) => {
          setIsMapModalOpen(false);
          setSaveSuccess(true);
          onLocationSaved?.(loc as any);
        }}
      />
    </div>
  );
}
