'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Search,
  Sparkles,
  RefreshCw,
  MapPin,
  Navigation,
  Map as MapIcon,
} from 'lucide-react';
import { apiClient, workerApi } from '@/lib/api-client';
import { DiscoveredJobItem, WorkerJobDiscoveryQuery } from '@localsaathi/types';
import { LocationPermissionCard } from '@/components/location/LocationPermissionCard';
import { InteractiveLocationMap } from '@/components/map/InteractiveLocationMap';
import type { GeocodingResult } from '@/lib/geocoding';
import { useTranslation } from '@/i18n/context';

const SAMPLE_PREVIEW_JOBS: DiscoveredJobItem[] = ([
  {
    id: 'demo-job-1',
    title: 'Emergency Residential Pipe Replacement',
    description: 'Need licensed plumber to replace broken bathroom inlet valve and repair pipe joint leaks. Immediate response needed.',
    category: 'Plumbing',
    status: 'PUBLISHED' as any,
    urgency: 'IMMEDIATE' as any,
    wageType: 'DAILY' as any,
    wageAmount: 900,
    workerCount: 1,
    durationDays: 1,
    startDate: 'Today',
    startTime: '09:00',
    requirements: ['Must carry pipe wrench and sealant', 'Clean working practices'],
    languageRequirements: ['hi', 'en'],
    publishedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    location: {
      locality: 'Hazratganj',
      city: 'Lucknow',
      state: 'Uttar Pradesh',
      pinCode: '226001',
      addressLine: '14/B Ashok Marg',
      latitude: 26.8500,
      longitude: 80.9480,
    },
    employer: {
      id: 'emp-1',
      businessName: 'Sharma Home Renovations',
      businessType: 'Contractor',
      rating: 4.8,
      totalReviews: 24,
    },
    requiredSkills: [
      { skillId: 's-1', name: 'Plumbing', category: 'Plumbing', isRequired: true, minExperienceYears: 3 },
      { skillId: 's-2', name: 'Pipe Fitting', category: 'Plumbing', isRequired: true, minExperienceYears: 2 },
    ],
    distanceKm: 1.2,
    match: {
      score: 96,
      reasons: ['Walking distance (1.2 km)', 'High trade relevance (Plumbing)', 'Prompt daily payout'],
      breakdown: { skillScore: 40, distanceScore: 35, ratingScore: 21, totalScore: 96 },
    },
  },
  {
    id: 'demo-job-2',
    title: 'Commercial Building Electrical Wiring & MCB Distribution',
    description: 'Looking for a certified electrician to install main distribution boards, test circuit breakers, and run conduit lines.',
    category: 'Electrical',
    status: 'PUBLISHED' as any,
    urgency: 'HIGH' as any,
    wageType: 'DAILY' as any,
    wageAmount: 850,
    workerCount: 2,
    durationDays: 3,
    startDate: 'Tomorrow',
    startTime: '08:30',
    requirements: ['Experience with industrial 3-phase wiring', 'Safety footwear required'],
    languageRequirements: ['hi'],
    publishedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    location: {
      locality: 'Aliganj',
      city: 'Lucknow',
      state: 'Uttar Pradesh',
      pinCode: '226024',
      addressLine: 'Sector B, Kapoorthala',
      latitude: 26.8900,
      longitude: 80.9400,
    },
    employer: {
      id: 'emp-2',
      businessName: 'Verma Infrastructure Pvt Ltd',
      businessType: 'Construction',
      rating: 4.9,
      totalReviews: 42,
    },
    requiredSkills: [
      { skillId: 's-3', name: 'Electrical Wiring', category: 'Electrical', isRequired: true, minExperienceYears: 4 },
      { skillId: 's-4', name: 'Appliance Repair', category: 'Electrical', isRequired: false, minExperienceYears: 1 },
    ],
    distanceKm: 2.4,
    match: {
      score: 91,
      reasons: ['Under 3km commute', 'Multi-day project guarantee', 'Top employer rating'],
      breakdown: { skillScore: 38, distanceScore: 33, ratingScore: 20, totalScore: 91 },
    },
  },
  {
    id: 'demo-job-3',
    title: 'Custom Wooden Wardrobe & Kitchen Cabinet Carpentry',
    description: 'Skilled carpenter required to assemble modular plywood cabinets, fit soft-close hinges, and align drawer channels.',
    category: 'Carpentry',
    status: 'PUBLISHED' as any,
    urgency: 'NORMAL' as any,
    wageType: 'DAILY' as any,
    wageAmount: 950,
    workerCount: 1,
    durationDays: 4,
    startDate: 'This Week',
    startTime: '10:00',
    requirements: ['Bring precision measuring tape and drill machine', 'Plywood edging experience'],
    languageRequirements: ['hi'],
    publishedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    location: {
      locality: 'Gomti Nagar',
      city: 'Lucknow',
      state: 'Uttar Pradesh',
      pinCode: '226010',
      addressLine: 'Vibhav Khand 2',
      latitude: 26.8600,
      longitude: 80.9900,
    },
    employer: {
      id: 'emp-3',
      businessName: 'Urban Crafts Interior Studio',
      businessType: 'Interiors',
      rating: 4.7,
      totalReviews: 18,
    },
    requiredSkills: [
      { skillId: 's-5', name: 'Carpentry', category: 'Carpentry', isRequired: true, minExperienceYears: 5 },
      { skillId: 's-6', name: 'Furniture Assembly', category: 'Carpentry', isRequired: true, minExperienceYears: 3 },
    ],
    distanceKm: 3.8,
    match: {
      score: 87,
      reasons: ['High wage tier (₹950/day)', 'Workshop environment', 'Quality tools on site'],
      breakdown: { skillScore: 35, distanceScore: 32, ratingScore: 20, totalScore: 87 },
    },
  },
] as unknown as DiscoveredJobItem[]);

export default function WorkerJobDiscoveryPage() {
  const { t, formatCurrency } = useTranslation();
  const [jobs, setJobs] = useState<DiscoveredJobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationRequired, setLocationRequired] = useState(false);
  const [showLocationPrompt, setShowLocationPrompt] = useState(false);
  const [showMap, setShowMap] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [searchAreaCenter, setSearchAreaCenter] = useState<{ latitude: number; longitude: number } | null>(null);

  const [workerLocation, setWorkerLocation] = useState<{
    latitude?: number;
    longitude?: number;
    locality?: string | null;
    city?: string | null;
    addressLine?: string | null;
    pinCode?: string | null;
    state?: string | null;
    preferredRadiusKm?: number;
  } | null>(null);

  // Filter and sort state
  const [category, setCategory] = useState<string>('');
  const [radiusKm, setRadiusKm] = useState<number>(10);
  const [sort, setSort] = useState<'score_desc' | 'distance_asc' | 'wage_desc' | 'created_desc'>('score_desc');
  const [minWage, setMinWage] = useState<string>('');

  const loadJobs = useCallback(
    async (
      customRadius?: number,
      customCategory?: string,
      customCenter?: { latitude: number; longitude: number }
    ) => {
      setLoading(true);
      setError(null);
      setLocationRequired(false);

      const centerToUse = customCenter !== undefined ? customCenter : searchAreaCenter;
      if (customCenter !== undefined) {
        setSearchAreaCenter(customCenter);
      }

      const token = apiClient.getToken();
      if (!token) {
        setIsGuest(true);
        // Filter the sample preview jobs according to controls
        let filtered = [...SAMPLE_PREVIEW_JOBS];
        const activeCat = (customCategory ?? category).trim();
        if (activeCat) {
          filtered = filtered.filter((j) => j.category.toLowerCase() === activeCat.toLowerCase());
        }
        if (minWage) {
          filtered = filtered.filter((j) => j.wageAmount >= Number(minWage));
        }
        setJobs(filtered);
        setLoading(false);
        return;
      }

      try {
        setIsGuest(false);
        const activeRadius = customRadius !== undefined ? customRadius : radiusKm;
        const query: WorkerJobDiscoveryQuery = {
          radiusKm: activeRadius > 0 ? activeRadius : undefined,
          latitude: centerToUse?.latitude,
          longitude: centerToUse?.longitude,
          category: (customCategory ?? category).trim() || undefined,
          minWage: minWage ? Number(minWage) : undefined,
          sort,
          page: 1,
          limit: 20,
        };

        const res = await workerApi.getDiscoveredJobs(query);
        if (res.items && res.items.length > 0) {
          setJobs(res.items);
        } else {
          setJobs([]);
        }
      } catch (err: any) {
        if (err.message && err.message.includes('LOCATION_REQUIRED')) {
          setLocationRequired(true);
        } else if (err.message && err.message.includes('token')) {
          setIsGuest(true);
          setJobs(SAMPLE_PREVIEW_JOBS);
        } else {
          setError(err.message || 'Failed to load matching jobs.');
        }
      } finally {
        setLoading(false);
      }
    },
    [category, radiusKm, sort, minWage, searchAreaCenter]
  );

  // Initial load
  useEffect(() => {
    let isMounted = true;
    async function initFeed() {
      let initialRadius = radiusKm;
      const requestedCategory = new URLSearchParams(window.location.search).get('category') || '';
      if (requestedCategory && isMounted) setCategory(requestedCategory);

      try {
        if (apiClient.getToken()) {
          const [profile, loc] = await Promise.all([
            workerApi.getProfile().catch(() => null),
            workerApi.getLocation().catch(() => null),
          ]);
          if (profile?.preferredRadiusKm) {
            initialRadius = profile.preferredRadiusKm;
            if (isMounted) setRadiusKm(initialRadius);
          }
          if (loc && isMounted) {
            setWorkerLocation({
              latitude: loc.latitude,
              longitude: loc.longitude,
              locality: loc.locality || undefined,
              city: loc.city || undefined,
              addressLine: loc.addressLine,
              pinCode: loc.pinCode,
              state: loc.state,
              preferredRadiusKm: loc.preferredRadiusKm,
            });
          }
        }
      } catch {
        // Fallback to initial state
      }

      if (isMounted) {
        loadJobs(initialRadius, requestedCategory);
      }
    }
    initFeed();
    return () => {
      isMounted = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLocationSaved = useCallback(
    (loc: { latitude?: number; longitude?: number; locality?: string; city?: string }) => {
      setWorkerLocation((prev) => ({
        ...prev,
        latitude: loc.latitude,
        longitude: loc.longitude,
        locality: loc.locality,
        city: loc.city,
      }));
      setLocationRequired(false);
      setShowLocationPrompt(false);
      loadJobs(radiusKm, undefined, loc.latitude && loc.longitude ? { latitude: loc.latitude, longitude: loc.longitude } : undefined);
    },
    [loadJobs, radiusKm]
  );

  const handleMapLocationConfirm = async (loc: GeocodingResult, radius: number) => {
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

    setWorkerLocation({
      latitude: loc.latitude,
      longitude: loc.longitude,
      locality: resp.locality || loc.locality,
      city: resp.city || loc.city,
      addressLine: loc.addressLine,
      pinCode: loc.pinCode,
      state: loc.state,
      preferredRadiusKm: radius,
    });
    setRadiusKm(radius);
    setSearchAreaCenter({ latitude: loc.latitude, longitude: loc.longitude });
    setLocationRequired(false);
    setShowLocationPrompt(false);
    await loadJobs(radius, undefined, { latitude: loc.latitude, longitude: loc.longitude });
  };

  const handleSelectJobFromMap = (jobId: string) => {
    setSelectedJobId(jobId);
    const cardEl = document.getElementById(`job-card-${jobId}`);
    if (cardEl) {
      cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const loginDemoWorker = async () => {
    setLoading(true);
    try {
      const req = await apiClient.requestOtp('9123456780', 'WORKER');
      const match = req.message.match(/\[Dev Mode\] Verification code is:\s*(\d{6})/);
      const code = match ? match[1] : '123456';
      const res = await apiClient.verifyOtp('9123456780', code, 'WORKER');
      apiClient.setToken(res.accessToken);
      if (typeof window !== 'undefined') {
        localStorage.setItem('user', JSON.stringify(res.user));
        localStorage.setItem('token', res.accessToken);
      }
      setIsGuest(false);
      await loadJobs();
    } catch {
      setIsGuest(true);
    } finally {
      setLoading(false);
    }
  };

  const jobsWithCoordinatesCount = jobs.filter((j) => j.location?.latitude && j.location?.longitude).length;

  return (
    <div className="min-h-screen bg-[#f7f9f6] text-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header and Context */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#e2e7df] pb-6">
          <div>
            <div className="flex items-center space-x-2 text-sm text-slate-500 mb-1">
              <Link href="/worker" className="transition hover:text-[#28734f]">
                {t('worker.dashboard')}
              </Link>
              <span>/</span>
              <span className="text-slate-800 font-medium">{t('nav.findWork')}</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[#18382c] sm:text-3xl">
              {t('jobs.pageTitle')}
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              {t('jobs.pageSubtitle')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {workerLocation && (
              <div className="inline-flex items-center gap-1.5 rounded-xl border border-[#d2dfd4] bg-[#f2f7f3] px-3 py-2 text-xs font-semibold text-[#18382c]">
                <MapPin className="h-3.5 w-3.5 text-[#28734f]" />
                <span>{workerLocation.locality || workerLocation.city || t('worker.locationStatus')}</span>
              </div>
            )}

            {/* Toggle Map View Button */}
            <button
              type="button"
              onClick={() => setShowMap((prev) => !prev)}
              className={`inline-flex items-center rounded-xl border px-3.5 py-2.5 text-xs font-semibold shadow-sm transition focus:outline-none ${
                showMap
                  ? 'border-[#28734f] bg-[#edf4ed] text-[#18382c]'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-[#b7cdb9] hover:bg-[#f8faf7]'
              }`}
              aria-label="Toggle Interactive Map"
            >
              <MapIcon className="w-3.5 h-3.5 mr-1.5 text-[#28734f]" />
              <span>{t('jobs.mapView')}</span>
              {jobsWithCoordinatesCount > 0 && (
                <span className="ml-1.5 rounded-full bg-[#173b2f] px-1.5 py-0.2 text-[10px] font-bold text-white">
                  {jobsWithCoordinatesCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setShowLocationPrompt((prev) => !prev)}
              className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-[#b7cdb9] hover:bg-[#f8faf7] focus:outline-none"
            >
              <Navigation className="w-3.5 h-3.5 mr-1.5 text-[#28734f]" />
              {workerLocation ? t('worker.updateLocation') : t('map.chooseThisLocation')}
            </button>

            <button
              onClick={() => loadJobs()}
              disabled={loading}
              className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-[#b7cdb9] hover:bg-[#f8faf7] focus:outline-none"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
              {t('common.refresh')}
            </button>
          </div>
        </div>

        {/* Location Permission UI Card (shown when location is required or user requested update) */}
        {(locationRequired || showLocationPrompt) && (
          <LocationPermissionCard
            savedLocation={workerLocation}
            onLocationSaved={handleLocationSaved}
            onDismiss={locationRequired ? undefined : () => setShowLocationPrompt(false)}
          />
        )}

        {/* Guest Preview Notice Banner */}
        {isGuest && (
          <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-[#edf4ed] to-[#f7f4ea] p-5 shadow-sm">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#173b2f] text-white">
                  <Sparkles className="h-5 w-5 text-[#e2bd80]" />
                </div>
                <div>
                  <h3 className="font-bold text-[#18382c] text-sm sm:text-base">
                    Viewing in Guest Preview Mode
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5 max-w-xl">
                    Sign in as a worker to calculate real-time PostGIS distance, personalized trade match scores, and submit instant applications.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={loginDemoWorker}
                  className="rounded-xl bg-[#173b2f] px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#245944]"
                >
                  1-Click Worker Demo
                </button>
                <Link
                  href="/login?role=WORKER"
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                >
                  Sign In with Phone
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Interactive Map Section */}
        {showMap && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <MapIcon className="h-4 w-4 text-[#28734f]" />
                <h2 className="text-sm font-bold text-[#18382c]">
                  Interactive Location Radar & Job Map
                </h2>
              </div>
              <span className="text-xs text-slate-500">
                Click pins to focus job • Drag center pin or search area
              </span>
            </div>

            <InteractiveLocationMap
              savedLocation={workerLocation}
              radiusKm={radiusKm}
              onRadiusChange={(r) => {
                setRadiusKm(r);
                loadJobs(r);
              }}
              onConfirmLocation={handleMapLocationConfirm}
              onSearchThisArea={(center, r) => {
                setSearchAreaCenter(center);
                loadJobs(r, undefined, center);
              }}
              jobs={jobs}
              selectedJobId={selectedJobId}
              onSelectJob={handleSelectJobFromMap}
              height="440px"
            />
          </div>
        )}

        {/* Filter & Sorting Controls */}
        <div className="space-y-4 rounded-2xl border border-[#e2e7df] bg-white p-5 shadow-sm sm:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Category Filter */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Trade Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-[#fbfcfa] p-2.5 text-sm font-semibold text-slate-800 focus:border-[#28734f] focus:outline-none"
              >
                <option value="">All Categories</option>
                <option value="Plumbing">Plumbing</option>
                <option value="Electrical">Electrical</option>
                <option value="Carpentry">Carpentry</option>
                <option value="Construction">Construction</option>
                <option value="Painting">Painting</option>
                <option value="Housekeeping">Housekeeping</option>
                <option value="Logistics">Logistics</option>
              </select>
            </div>

            {/* Radius Selector */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Service Radius
                </label>
                <span className="text-xs font-bold text-[#28734f]">{radiusKm} km</span>
              </div>
              <div className="flex items-center gap-1.5">
                {[5, 10, 25, 50].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setRadiusKm(r);
                      loadJobs(r);
                    }}
                    className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition ${
                      radiusKm === r
                        ? 'bg-[#173b2f] text-white shadow-sm'
                        : 'border border-slate-200 bg-[#fbfcfa] text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {r}k
                  </button>
                ))}
              </div>
            </div>

            {/* Min Wage */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Min Wage (₹)
              </label>
              <input
                type="number"
                placeholder="e.g. 800"
                value={minWage}
                onChange={(e) => setMinWage(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-[#fbfcfa] p-2.5 text-sm font-semibold text-slate-800 focus:border-[#28734f] focus:outline-none"
              />
            </div>

            {/* Sort Options */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Sort By
              </label>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as any)}
                className="w-full rounded-xl border border-slate-200 bg-[#fbfcfa] p-2.5 text-sm font-semibold text-slate-800 focus:border-[#28734f] focus:outline-none"
              >
                <option value="score_desc">Best Match Score</option>
                <option value="distance_asc">Nearest Distance</option>
                <option value="wage_desc">Highest Wage</option>
                <option value="created_desc">Recently Posted</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col justify-between gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center">
            <p className="text-xs text-slate-500">
              Radius and category filter jobs around your active service area.
            </p>
            <button
              type="button"
              onClick={() => loadJobs()}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#173b2f] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#245944] disabled:opacity-60"
            >
              <Search className="h-4 w-4" />
              {loading ? 'Searching…' : 'Apply filters'}
            </button>
          </div>
        </div>

        {/* Results Stream */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="animate-pulse space-y-4 rounded-2xl border border-[#e2e7df] bg-white p-6 shadow-sm"
              >
                <div className="h-5 bg-slate-200 rounded w-1/3"></div>
                <div className="h-4 bg-slate-100 rounded w-2/3"></div>
                <div className="flex space-x-3">
                  <div className="h-6 bg-slate-200 rounded w-20"></div>
                  <div className="h-6 bg-slate-200 rounded w-24"></div>
                </div>
              </div>
            ))}
          </div>
        ) : error && !jobs.length ? (
          <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-red-700 text-center">
            <p className="font-semibold">{error}</p>
            <button
              onClick={() => loadJobs()}
              className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition"
            >
              Try Again
            </button>
          </div>
        ) : jobs.length === 0 ? (
          <div className="space-y-4 rounded-2xl border border-[#e2e7df] bg-white p-12 text-center shadow-sm">
            <div className="text-4xl">🔍</div>
            <h3 className="text-lg font-bold text-slate-800">No Matching Jobs Found</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              There are currently no active jobs matching your selected radius ({radiusKm} km) and criteria. Try expanding your search radius, searching another area on the map, or clearing filters.
            </p>
            <button
              onClick={() => {
                setCategory('');
                setMinWage('');
                setRadiusKm(30);
                loadJobs(30, '');
              }}
              className="inline-flex items-center px-4 py-2 border border-emerald-600 text-emerald-700 font-medium text-sm rounded-lg hover:bg-emerald-50 transition"
            >
              Expand Radius & Clear Filters
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <span>Showing {jobs.length} Verified Jobs Nearby</span>
              <span>Updated in Real Time</span>
            </div>

            {jobs.map((job) => {
              const isHighMatch = job.match?.score >= 80;
              const isSelected = selectedJobId === job.id;

              return (
                <div
                  id={`job-card-${job.id}`}
                  key={job.id}
                  onClick={() => setSelectedJobId(job.id)}
                  className={`flex flex-col justify-between gap-6 rounded-2xl border p-5 shadow-sm transition duration-200 cursor-pointer sm:p-6 md:flex-row ${
                    isSelected
                      ? 'border-[#28734f] ring-2 ring-[#28734f]/30 bg-[#fbfdfa] shadow-md'
                      : 'border-[#e2e7df] bg-white hover:-translate-y-0.5 hover:border-[#bad0bd] hover:shadow-[0_14px_34px_rgba(35,75,48,0.08)]'
                  }`}
                >
                  <div className="space-y-3 flex-1">
                    {/* Top Row: Title, Badges */}
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg sm:text-xl font-bold text-slate-900 hover:text-[#28734f] transition">
                        <Link href={`/worker/jobs/${job.id}`}>
                          {job.title}
                        </Link>
                      </h2>

                      {/* Match Score Badge */}
                      {job.match && (
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            isHighMatch
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-amber-100 text-amber-800 border border-amber-300'
                          }`}
                        >
                          ⚡ {job.match.score}% Match
                        </span>
                      )}

                      {/* Distance Pill */}
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#edf4ed] text-[#28734f] border border-[#d6e9d9]">
                        📍 {job.distanceKm} km away
                      </span>

                      {/* Urgency Pill */}
                      {job.urgency === 'IMMEDIATE' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-rose-100 text-rose-800">
                          Urgent
                        </span>
                      )}

                      {isSelected && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-[#173b2f] text-[#e2bd80]">
                          Focused on Map
                        </span>
                      )}
                    </div>

                    {/* Employer & Locality */}
                    <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-semibold text-slate-700">
                        🏢 {job.employer.businessName}
                      </span>
                      <span>•</span>
                      <span>
                        📌 {job.location.locality}, {job.location.city}
                      </span>
                      <span>•</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                        {job.category}
                      </span>
                    </div>

                    {/* Description preview */}
                    <p className="text-sm text-slate-600 line-clamp-2">
                      {job.description}
                    </p>

                    {/* Required Skills Tags */}
                    {job.requiredSkills?.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-xs font-medium text-slate-400 mr-1">Skills:</span>
                        {job.requiredSkills.map((s) => (
                          <span
                            key={s.skillId}
                            className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-medium"
                          >
                            {s.name}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Explainable Match Reasons */}
                    {job.match?.reasons && job.match.reasons.length > 0 && (
                      <div className="bg-[#fbfcfa] p-2.5 rounded-xl border border-slate-100 space-y-1">
                        {job.match.reasons.slice(0, 3).map((reason, idx) => (
                          <div key={idx} className="text-xs text-slate-600 flex items-start space-x-1.5">
                            <span className="text-[#28734f] font-bold shrink-0">✓</span>
                            <span>{reason}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Right Column: Wage, Schedule & Action Button */}
                  <div className="flex md:flex-col justify-between items-end md:items-end border-t md:border-t-0 pt-4 md:pt-0 border-slate-100 md:min-w-[180px]">
                    <div className="text-left md:text-right">
                      <div className="text-xl sm:text-2xl font-extrabold text-[#18382c]">
                        {formatCurrency(job.wageAmount)}
                      </div>
                      <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                        per {job.wageType.toLowerCase()}
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        📅 Starts: {job.startDate}
                      </div>
                    </div>

                    <Link
                      href={`/worker/jobs/${job.id}`}
                      className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-[#173b2f] hover:bg-[#245944] text-white font-bold text-xs transition shadow-sm"
                    >
                      View Details &rarr;
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
