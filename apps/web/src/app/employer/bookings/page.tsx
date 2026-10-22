'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@localsaathi/ui';
import {
  Briefcase,
  Calendar,
  Clock,
  MapPin,
  IndianRupee,
  CheckCircle2,
  PlayCircle,
  XCircle,
  AlertCircle,
  ArrowRight,
  Filter,
} from 'lucide-react';
import { employerApi } from '@/lib/api-client';
import { BookingSummary, BookingStatus } from '@localsaathi/types';

const STATUS_FILTERS: { label: string; value: string }[] = [
  { label: 'All Contracts', value: 'ALL' },
  { label: 'Pending Confirmation', value: BookingStatus.PENDING_CONFIRMATION },
  { label: 'Confirmed', value: BookingStatus.CONFIRMED },
  { label: 'In Progress', value: BookingStatus.IN_PROGRESS },
  { label: 'Completed', value: BookingStatus.COMPLETED },
  { label: 'Cancelled', value: BookingStatus.CANCELLED },
];

export default function EmployerBookingsPage() {
  const [bookings, setBookings] = useState<BookingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const loadBookings = async (statusFilter?: string) => {
    setLoading(true);
    setError(null);
    try {
      const status =
        statusFilter && statusFilter !== 'ALL'
          ? (statusFilter as BookingStatus)
          : undefined;
      const res = await employerApi.getEmployerBookings({ status });
      setBookings(res.items || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load bookings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBookings(selectedStatus);
  }, [selectedStatus]);

  const handleStartBooking = async (bookingId: string) => {
    setActionLoadingId(bookingId);
    setActionSuccess(null);
    setError(null);
    try {
      await employerApi.startBooking(bookingId);
      setActionSuccess('Engagement started successfully!');
      await loadBookings(selectedStatus);
    } catch (err: any) {
      setError(err.message || 'Failed to start booking.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCompleteBooking = async (bookingId: string) => {
    setActionLoadingId(bookingId);
    setActionSuccess(null);
    setError(null);
    try {
      await employerApi.completeBooking(bookingId);
      setActionSuccess('Engagement completed successfully!');
      await loadBookings(selectedStatus);
    } catch (err: any) {
      setError(err.message || 'Failed to complete booking.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const getStatusBadge = (status: BookingStatus) => {
    switch (status) {
      case BookingStatus.PENDING_CONFIRMATION:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3.5 h-3.5" /> Pending Worker Confirmation
          </span>
        );
      case BookingStatus.CONFIRMED:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <CheckCircle2 className="w-3.5 h-3.5" /> Confirmed
          </span>
        );
      case BookingStatus.IN_PROGRESS:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            <PlayCircle className="w-3.5 h-3.5" /> In Progress
          </span>
        );
      case BookingStatus.COMPLETED:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" /> Completed
          </span>
        );
      case BookingStatus.CANCELLED:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3.5 h-3.5" /> Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Briefcase className="w-7 h-7 text-indigo-600" />
              Contracted Engagements & Bookings
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Manage work agreements initiated from accepted applications.
            </p>
          </div>
          <Link href="/employer/jobs">
            <Button variant="outline" size="sm">
              View Active Jobs
            </Button>
          </Link>
        </div>

        {/* Alerts */}
        {actionSuccess && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <p className="text-sm font-medium">{actionSuccess}</p>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
          <div className="flex items-center gap-2 mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <Filter className="w-4 h-4" /> Filter by Status
          </div>
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setSelectedStatus(f.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  selectedStatus === f.value
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Bookings List */}
        {loading ? (
          <div className="py-16 text-center text-slate-500">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Loading engagements...
          </div>
        ) : bookings.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <Briefcase className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-800 mb-1">
              No Bookings Found
            </h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
              When you accept candidates and initiate contracts, your active and
              historical engagements will appear here.
            </p>
            <Link href="/employer/jobs">
              <Button size="sm">Browse Job Applications</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {bookings.map((booking) => (
              <div
                key={booking.id}
                className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:border-slate-300 transition-shadow"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-lg font-bold text-slate-900">
                        {booking.jobTitle}
                      </h3>
                      {getStatusBadge(booking.status)}
                    </div>
                    <p className="text-sm text-slate-600">
                      Worker:{' '}
                      <span className="font-semibold text-slate-800">
                        {booking.workerName}
                      </span>{' '}
                      • Category: {booking.jobCategory}
                    </p>
                  </div>

                  <div className="text-right">
                    <div className="text-lg font-bold text-slate-900 flex items-center justify-end gap-1">
                      <IndianRupee className="w-4 h-4" />
                      {booking.totalAmount.toLocaleString('en-IN')}
                    </div>
                    <p className="text-xs text-slate-500">
                      ₹{booking.agreedWage}/{booking.wageType.toLowerCase()} •{' '}
                      {booking.durationDays}{' '}
                      {booking.durationDays === 1 ? 'day' : 'days'}
                    </p>
                  </div>
                </div>

                <div className="py-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <span>Start: {booking.startDate}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <span>
                      Hours:{' '}
                      {booking.startTime
                        ? `${booking.startTime} - ${booking.endTime || 'Wrap'}`
                        : 'Standard Workday'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-slate-400" />
                    <span>
                      {booking.workLocationLocality
                        ? `${booking.workLocationLocality}, ${booking.workLocationCity}`
                        : 'Location on file'}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                  <Link href={`/employer/bookings/${booking.id}`}>
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800">
                      View Contract Terms <ArrowRight className="w-4 h-4" />
                    </span>
                  </Link>

                  <div className="flex items-center gap-2">
                    {booking.status === BookingStatus.CONFIRMED && (
                      <Button
                        size="sm"
                        onClick={() => handleStartBooking(booking.id)}
                        disabled={actionLoadingId === booking.id}
                        className="bg-indigo-600 hover:bg-indigo-700"
                      >
                        <PlayCircle className="w-4 h-4 mr-1.5" /> Start Work
                      </Button>
                    )}

                    {booking.status === BookingStatus.IN_PROGRESS && (
                      <Button
                        size="sm"
                        onClick={() => handleCompleteBooking(booking.id)}
                        disabled={actionLoadingId === booking.id}
                        className="bg-emerald-600 hover:bg-emerald-700"
                      >
                        <CheckCircle2 className="w-4 h-4 mr-1.5" /> Complete
                        Engagement
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
