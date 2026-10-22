'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent, Button, Input } from '@localsaathi/ui';
import {
  HardHat,
  ChevronLeft,
  CheckCircle2,
  MapPin,
  DollarSign,
  Edit2,
  Save,
  X,
  Navigation,
} from 'lucide-react';
import { WageType, WorkerLocationResponse } from '@localsaathi/types';
import { workerApi } from '@/lib/api-client';
import { LocationPermissionCard } from '@/components/location/LocationPermissionCard';

export default function WorkerProfilePage() {
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState('Ramesh Kumar');
  const [bio, setBio] = useState('Residential plumber with 7+ years expertise in pipe fitting, water tank repairs, and bathroom fittings.');
  const [experienceYears, setExperienceYears] = useState(7);
  const [expectedWage, setExpectedWage] = useState(800);
  const wageType = WageType.DAILY;
  const [preferredRadiusKm, setPreferredRadiusKm] = useState(15);
  const languages = ['Hindi', 'English'];
  const [savedMsg, setSavedMsg] = useState(false);
  const [location, setLocation] = useState<WorkerLocationResponse | null>(null);
  const [showLocationPrompt, setShowLocationPrompt] = useState(false);

  React.useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const [prof, loc] = await Promise.all([
          workerApi.getProfile().catch(() => null),
          workerApi.getLocation().catch(() => null),
        ]);
        if (isMounted) {
          if (prof) {
            if (prof.displayName) setDisplayName(prof.displayName);
            if (prof.bio) setBio(prof.bio);
            if (prof.experienceYears !== undefined) setExperienceYears(prof.experienceYears);
            if (prof.expectedWage !== undefined && prof.expectedWage !== null) setExpectedWage(prof.expectedWage);
            if (prof.preferredRadiusKm) setPreferredRadiusKm(prof.preferredRadiusKm);
          }
          if (loc) {
            setLocation(loc);
          }
        }
      } catch {
        // Fallback to defaults
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSave = () => {
    setIsEditing(false);
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 3000);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Top Navigation */}
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/worker"
          className="text-xs font-semibold text-slate-500 hover:text-slate-900 flex items-center gap-1"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>
        {!isEditing ? (
          <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
            <Edit2 className="w-3.5 h-3.5 mr-1" />
            Edit Profile
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
              <X className="w-3.5 h-3.5 mr-1" />
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSave}>
              <Save className="w-3.5 h-3.5 mr-1" />
              Save Changes
            </Button>
          </div>
        )}
      </div>

      {savedMsg && (
        <div className="mb-6 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          Profile updated successfully!
        </div>
      )}

      {/* Main Profile Header */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-2xl border-2 border-emerald-300">
            <HardHat className="w-10 h-10" />
          </div>
          <div className="flex-1">
            {!isEditing ? (
              <h1 className="text-2xl font-bold text-slate-900">{displayName}</h1>
            ) : (
              <div className="max-w-xs">
                <label className="text-xs font-bold text-slate-600 uppercase">Display Name</label>
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Onboarding: Completed
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                Verification: Unverified
              </span>
              <span className="text-xs text-slate-500">
                Member since September 2026
              </span>
            </div>
          </div>
        </div>

        {/* Bio */}
        <div className="mt-6 pt-4 border-t border-slate-100">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
            About & Specialties
          </h3>
          {!isEditing ? (
            <p className="text-sm text-slate-700 leading-relaxed">{bio}</p>
          ) : (
            <textarea
              className="w-full rounded-md border border-slate-300 p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
            />
          )}
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Trade Experience & Wage */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              Work & Wage Terms
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between items-center py-1 border-b border-slate-100">
              <span className="text-slate-500">Experience:</span>
              {!isEditing ? (
                <span className="font-semibold text-slate-900">{experienceYears} Years</span>
              ) : (
                <input
                  type="number"
                  className="w-20 rounded border border-slate-300 px-2 py-1 text-sm"
                  value={experienceYears}
                  onChange={(e) => setExperienceYears(parseInt(e.target.value) || 0)}
                />
              )}
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-100">
              <span className="text-slate-500">Expected Base Wage:</span>
              {!isEditing ? (
                <span className="font-semibold text-slate-900">₹{expectedWage} / {wageType}</span>
              ) : (
                <div className="flex items-center gap-1">
                  <span className="text-slate-500">₹</span>
                  <input
                    type="number"
                    className="w-24 rounded border border-slate-300 px-2 py-1 text-sm"
                    value={expectedWage}
                    onChange={(e) => setExpectedWage(parseInt(e.target.value) || 0)}
                  />
                </div>
              )}
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-slate-500">Travel Radius:</span>
              {!isEditing ? (
                <span className="font-semibold text-slate-900">{preferredRadiusKm} km</span>
              ) : (
                <input
                  type="number"
                  className="w-20 rounded border border-slate-300 px-2 py-1 text-sm"
                  value={preferredRadiusKm}
                  onChange={(e) => setPreferredRadiusKm(parseInt(e.target.value) || 1)}
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Location & Languages */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="w-4 h-4 text-rose-600" />
                Service Zone & Languages
              </CardTitle>
              <button
                type="button"
                onClick={() => setShowLocationPrompt((prev) => !prev)}
                className="text-xs font-semibold text-[#28734f] hover:underline flex items-center gap-1"
              >
                <Navigation className="w-3 h-3" />
                {location ? 'Update Area' : 'Set Location'}
              </button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between items-center py-1 border-b border-slate-100">
              <span className="text-slate-500">Locality:</span>
              <span className="font-semibold text-slate-900">
                {location?.locality || location?.city || 'Hazratganj, Lucknow'}
              </span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-100">
              <span className="text-slate-500">State / PIN:</span>
              <span className="font-semibold text-slate-900">
                {location ? `${location.state || 'Uttar Pradesh'} - ${location.pinCode || '226001'}` : 'Uttar Pradesh - 226001'}
              </span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-slate-500">Languages:</span>
              <span className="font-semibold text-slate-900">{languages.join(', ')}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Location Permission Prompt Modal/Card */}
      {showLocationPrompt && (
        <div className="mt-6">
          <LocationPermissionCard
            savedLocation={location}
            onLocationSaved={(newLoc) => {
              setLocation((prev) => ({
                ...(prev || {}),
                latitude: newLoc.latitude,
                longitude: newLoc.longitude,
                locality: newLoc.locality || null,
                city: newLoc.city || null,
                state: 'Uttar Pradesh',
                pinCode: prev?.pinCode || '226001',
                preferredRadiusKm: newLoc.preferredRadiusKm ?? preferredRadiusKm,
                updatedAt: new Date().toISOString(),
              }));
              if (newLoc.preferredRadiusKm) {
                setPreferredRadiusKm(newLoc.preferredRadiusKm);
              }
              setShowLocationPrompt(false);
              setSavedMsg(true);
              setTimeout(() => setSavedMsg(false), 3000);
            }}
            onDismiss={() => setShowLocationPrompt(false)}
          />
        </div>
      )}
    </div>
  );
}
