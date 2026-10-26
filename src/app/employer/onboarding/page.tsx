'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button } from '@localsaathi/ui';
import { employerApi } from '../../../lib/api-client';
import {
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Building2,
  Check,
  X,
  Sparkles,
} from 'lucide-react';

export default function EmployerOnboardingPage() {
  const [loading, setLoading] = useState(false);
  const [completion, setCompletion] = useState({
    completionPercentage: 80,
    completedSteps: ['businessName', 'description', 'businessType', 'contactPreferences'],
    remainingSteps: ['location'],
    isComplete: false,
    details: {
      businessName: true,
      description: true,
      businessType: true,
      contactPreferences: true,
      location: false,
    },
  });
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  useEffect(() => {
    employerApi
      .getEmployerCompletion()
      .then((res) => setCompletion(res))
      .catch(() => {});
  }, []);

  const handleFinalize = async () => {
    setLoading(true);
    setStatusMsg(null);
    try {
      await employerApi.completeEmployerOnboarding();
      setStatusMsg({
        type: 'success',
        message: 'Onboarding completed successfully! Your business profile is now active.',
      });
      setCompletion((prev) => ({
        ...prev,
        completionPercentage: 100,
        isComplete: true,
        remainingSteps: [],
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Cannot finalize onboarding';
      setStatusMsg({ type: 'error', message: msg });
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    {
      id: 'businessName',
      title: 'Company / Business Trade Name',
      desc: 'Official registered or operational trade name',
      done: completion.details.businessName,
    },
    {
      id: 'description',
      title: 'Business Overview & Services',
      desc: 'At least 10 characters describing your operational background',
      done: completion.details.description,
    },
    {
      id: 'businessType',
      title: 'Industry / Business Category',
      desc: 'Primary business domain (e.g. Construction, Logistics)',
      done: completion.details.businessType,
    },
    {
      id: 'contactPreferences',
      title: 'Worker Contact Channels',
      desc: 'Selected communication channels (Phone, In-App)',
      done: completion.details.contactPreferences,
    },
    {
      id: 'location',
      title: 'Business Location & PIN Code',
      desc: 'Operating city and 6-digit postal PIN code',
      done: completion.details.location,
    },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <Link
          href="/employer"
          className="text-sm font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <CardTitle>Employer Onboarding Verification</CardTitle>
                <CardDescription>
                  Complete all 5 required business criteria before posting public jobs.
                </CardDescription>
              </div>
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold text-blue-600">
                {completion.completionPercentage}%
              </span>
              <p className="text-xs text-slate-500 font-medium">Completed</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="w-full bg-slate-100 rounded-full h-3 mb-6">
            <div
              className={`h-3 rounded-full transition-all duration-300 ${
                completion.isComplete ? 'bg-emerald-500' : 'bg-blue-600'
              }`}
              style={{ width: `${completion.completionPercentage}%` }}
            />
          </div>

          {statusMsg && (
            <div
              className={`mb-6 p-4 rounded-lg flex items-center gap-2 border ${
                statusMsg.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              {statusMsg.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
              )}
              <span>{statusMsg.message}</span>
            </div>
          )}

          <div className="space-y-4 mb-8">
            {steps.map((step) => (
              <div
                key={step.id}
                className={`p-4 rounded-lg border flex items-center justify-between transition-colors ${
                  step.done
                    ? 'bg-emerald-50/40 border-emerald-200 text-slate-900'
                    : 'bg-white border-slate-200 text-slate-600'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                      step.done
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {step.done ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-slate-900">{step.title}</p>
                    <p className="text-xs text-slate-500">{step.desc}</p>
                  </div>
                </div>
                {!step.done && (
                  <Link href="/employer/profile">
                    <Button variant="outline" size="sm">
                      Complete Step
                    </Button>
                  </Link>
                )}
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
            <Link href="/employer/profile">
              <Button variant="outline">Edit Company Profile</Button>
            </Link>
            <Button
              onClick={handleFinalize}
              disabled={loading || !completion.isComplete}
              className={`flex items-center gap-2 ${
                completion.isComplete
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              {loading ? 'Finalizing...' : 'Finalize & Complete Onboarding'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
