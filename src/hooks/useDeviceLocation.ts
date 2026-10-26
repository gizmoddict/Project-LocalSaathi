'use client';

export type GeolocationStatus =
  | 'idle'
  | 'requesting'
  | 'granted'
  | 'denied'
  | 'unavailable'
  | 'timeout'
  | 'unsupported';

export interface Coordinates {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
}

export interface UseDeviceLocationOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
  onSuccess?: (coords: Coordinates) => void;
  onError?: (status: GeolocationStatus, message: string) => void;
}

export interface UseDeviceLocationResult {
  status: GeolocationStatus;
  coordinates: Coordinates | null;
  errorMessage: string | null;
  isSupported: boolean;
  requestLocation: () => Promise<Coordinates | null>;
  resetStatus: () => void;
}

import { useState, useCallback, useEffect } from 'react';

const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_MAX_AGE_MS = 60000; // 1 minute cache

export function useDeviceLocation(options: UseDeviceLocationOptions = {}): UseDeviceLocationResult {
  const {
    enableHighAccuracy = true,
    timeout = DEFAULT_TIMEOUT_MS,
    maximumAge = DEFAULT_MAX_AGE_MS,
    onSuccess,
    onError,
  } = options;

  const [status, setStatus] = useState<GeolocationStatus>('idle');
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState<boolean>(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsSupported('geolocation' in navigator);
    }
  }, []);

  const resetStatus = useCallback(() => {
    setStatus('idle');
    setErrorMessage(null);
  }, []);

  const requestLocation = useCallback(async (): Promise<Coordinates | null> => {
    // 1. Prevent overlapping requests
    if (status === 'requesting') {
      return null;
    }

    // 2. Check browser support
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      const msg = 'Device geolocation is not supported by your browser.';
      setStatus('unsupported');
      setErrorMessage(msg);
      onError?.('unsupported', msg);
      return null;
    }

    setStatus('requesting');
    setErrorMessage(null);

    return new Promise<Coordinates | null>((resolve) => {
      const geoOptions: PositionOptions = {
        enableHighAccuracy,
        timeout,
        maximumAge,
      };

      navigator.geolocation.getCurrentPosition(
        (position: GeolocationPosition) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          const acc = position.coords.accuracy;

          // Coordinate boundary validation
          if (
            typeof lat !== 'number' ||
            typeof lon !== 'number' ||
            isNaN(lat) ||
            isNaN(lon) ||
            lat < -90 ||
            lat > 90 ||
            lon < -180 ||
            lon > 180
          ) {
            const err = 'Invalid coordinates received from browser.';
            setStatus('unavailable');
            setErrorMessage(err);
            onError?.('unavailable', err);
            resolve(null);
            return;
          }

          const coords: Coordinates = {
            latitude: Number(lat.toFixed(6)),
            longitude: Number(lon.toFixed(6)),
            accuracyMeters: acc ? Math.round(acc) : undefined,
          };

          setCoordinates(coords);
          setStatus('granted');
          setErrorMessage(null);
          onSuccess?.(coords);
          resolve(coords);
        },
        (error: GeolocationPositionError) => {
          let nextStatus: GeolocationStatus = 'unavailable';
          let message = 'Unable to determine your device location.';

          switch (error.code) {
            case error.PERMISSION_DENIED:
              nextStatus = 'denied';
              message =
                'Location permission was denied. You can allow location in your browser settings or select a location manually.';
              break;
            case error.POSITION_UNAVAILABLE:
              nextStatus = 'unavailable';
              message =
                'Location information is unavailable on your device or GPS signal was lost.';
              break;
            case error.TIMEOUT:
              nextStatus = 'timeout';
              message =
                'Location request timed out. Please check your GPS signal or try again.';
              break;
            default:
              nextStatus = 'unavailable';
              message = error.message || 'An unexpected error occurred while acquiring location.';
          }

          setStatus(nextStatus);
          setErrorMessage(message);
          onError?.(nextStatus, message);
          resolve(null);
        },
        geoOptions
      );
    });
  }, [enableHighAccuracy, timeout, maximumAge, status, onSuccess, onError]);

  return {
    status,
    coordinates,
    errorMessage,
    isSupported,
    requestLocation,
    resetStatus,
  };
}
