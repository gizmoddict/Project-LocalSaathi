import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@localsaathi/ui';
import { Button } from '@localsaathi/ui';
import { Briefcase, Users, ShieldCheck, Cpu, HardHat, Compass } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Hero section */}
      <div className="text-center max-w-3xl mx-auto mb-16">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold mb-4 border border-emerald-200">
          <ShieldCheck className="w-3.5 h-3.5" />
          Production Engineering Architecture
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">
          Empowering Local Work with{' '}
          <span className="text-emerald-600">Hyperlocal Precision</span>
        </h1>
        <p className="mt-4 text-lg text-slate-600 leading-relaxed">
          LocalSaathi connects daily-wage workers, skilled artisans, and local contractors
          with verified nearby employers through location-based matching and fair wages.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button variant="primary" size="lg">
            Monorepo Active
          </Button>
          <Button variant="outline" size="lg">
            API Health Ready
          </Button>
        </div>
      </div>

      {/* Architecture Domain Grid */}
      <div className="mb-16">
        <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
          <Cpu className="w-5 h-5 text-emerald-600" />
          Foundation Subsystems (Phase 1 Baseline)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2">
                <HardHat className="w-5 h-5" />
              </div>
              <CardTitle>Worker Experience Foundation</CardTitle>
              <CardDescription>
                Designed for low-friction mobile interaction, zero resume requirement, and regional voice-assisted actions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <span className="inline-block px-2.5 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                Prepared Route: /worker
              </span>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-2">
                <Briefcase className="w-5 h-5" />
              </div>
              <CardTitle>Employer Experience Foundation</CardTitle>
              <CardDescription>
                Job posting wizard with multi-state lifecycle machine: Draft, Published, Filled, In-Progress, and Completed.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <span className="inline-block px-2.5 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                Prepared Route: /employer
              </span>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center mb-2">
                <Compass className="w-5 h-5" />
              </div>
              <CardTitle>Hyperlocal PostGIS Matching</CardTitle>
              <CardDescription>
                Spatial coordinate indexing (PostGIS GiST) providing sub-10ms radius search for jobs within 1km to 20km.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <span className="inline-block px-2.5 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                Spatial Engine: PostGIS 4326
              </span>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center mb-2">
                <Users className="w-5 h-5" />
              </div>
              <CardTitle>Phone-First Authentication</CardTitle>
              <CardDescription>
                OTP-based authentication with Argon2 hashing, 15-minute JWT access tokens, and refresh token rotation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <span className="inline-block px-2.5 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                Prepared Route: /auth
              </span>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center mb-2">
                <Cpu className="w-5 h-5" />
              </div>
              <CardTitle>NestJS REST API Core</CardTitle>
              <CardDescription>
                Modular API with OpenAPI documentation, centralized error handling, and live infrastructure readiness checks.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <span className="inline-block px-2.5 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                Base Path: /api/v1
              </span>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center mb-2">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <CardTitle>Asynchronous Worker Queues</CardTitle>
              <CardDescription>
                BullMQ worker architecture decoupled from HTTP request cycles for SMS, indexing, and notifications.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <span className="inline-block px-2.5 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                Queue Engine: BullMQ + Redis
              </span>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
