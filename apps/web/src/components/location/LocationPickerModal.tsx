'use client';

import React, { useState } from 'react';
import { X, MapPin, AlertCircle } from 'lucide-react';
import { InteractiveLocationMap } from '@/components/map/InteractiveLocationMap';
import { workerApi } from '@/lib/api-client';
import { useTranslation } from '@/i18n/context';
import type { GeocodingResult } from '@/lib/geocoding';

export interface LocationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedLocation?: {
    latitude?: number;
    longitude?: number;
    locality?: string | null;
    city?: string | null;
    addressLine?: string | null;
    pinCode?: string | null;
    state?: string | null;
  } | null;
  initialRadiusKm?: number;
  onLocationSaved?: (location: {
    latitude: number;
    longitude: number;
    locality?: string | null;
    city?: string | null;
    preferredRadiusKm?: number;
  }) => void;
}

export function LocationPickerModal({
  isOpen,
  onClose,
  savedLocation,
  initialRadiusKm = 10,
  onLocationSaved,
}: LocationPickerModalProps) {
  const { t } = useTranslation();
  const [radiusKm, setRadiusKm] = useState(initialRadiusKm);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConfirm = async (loc: GeocodingResult, radius: number) => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const resp = await workerApi.updateLocation({
        latitude: loc.latitude,
        longitude: loc.longitude,
        locality: loc.locality || null,
        city: loc.city || null,
        state: loc.state || null,
        pinCode: loc.pinCode || null,
        addressLine: loc.addressLine || null,
        preferredRadiusKm: radius,
      });

      if (typeof window !== 'undefined') {
        localStorage.setItem('localsaathi:location_configured', 'true');
      }

      onLocationSaved?.({
        latitude: loc.latitude,
        longitude: loc.longitude,
        locality: resp.locality || loc.locality,
        city: resp.city || loc.city,
        preferredRadiusKm: radius,
      });

      onClose();
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save location to worker profile.');
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative flex w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-[#d8e2d8] bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-picker-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-[#fbfcfa] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#173b2f] text-white">
              <MapPin className="h-5 w-5 text-[#e2bd80]" />
            </div>
            <div>
              <h2 id="location-picker-title" className="text-base font-bold text-[#18382c]">
                {t('worker.interactiveMap')}
              </h2>
              <p className="text-xs text-slate-500">
                {t('map.dragPinHint')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
            aria-label={t('common.close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {saveError && (
          <div className="mx-6 mt-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{saveError}</span>
          </div>
        )}

        {/* Interactive Map */}
        <div className="p-4 sm:p-6" data-preserve-ltr>
          <InteractiveLocationMap
            savedLocation={savedLocation}
            radiusKm={radiusKm}
            onRadiusChange={setRadiusKm}
            onConfirmLocation={handleConfirm}
            isConfirming={isSaving}
            height="420px"
          />
        </div>
      </div>
    </div>
  );
}
