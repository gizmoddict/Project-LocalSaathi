'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@localsaathi/ui';
import {
  ArrowLeft,
  Briefcase,
  Calendar,
  Clock,
  MapPin,
  IndianRupee,
  CheckCircle2,
  PlayCircle,
  XCircle,
  AlertCircle,
  Building,
  ShieldCheck,
} from 'lucide-react';
import { workerApi } from '@/lib/api-client';
import { BookingDetail, BookingStatus } from '@localsaathi/types';

export default function WorkerBookingDetailPage() {
  const params = useParams<{ bookingId: string }>();
  const bookingId = params?.bookingId as string;

  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Cancellation modal state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);

  const loadBooking = async () => {
    if (!bookingId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await workerApi.getWorkerBookingDetail(bookingId);
      setBooking(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load booking details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBooking();
  }, [bookingId]);

  const handleConfirm = async () => {
    setActionLoading(true);
    setActionSuccess(null);
    setError(null);
    try {
      const updated = await workerApi.confirmBooking(bookingId);
      setBooking(updated);
      setActionSuccess('Contract confirmed! You are scheduled for this job.');
    } catch (err: any) {
      setError(err.message || 'Failed to confirm booking.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (cancelReason.trim().length < 3) {
      setCancelError('Please enter a cancellation reason (minimum 3 characters).');
      return;
    }
    setActionLoading(true);
    setCancelError(null);
    try {
      const updated = await workerApi.cancelWorkerBooking(bookingId, cancelReason.trim());
      setBooking(updated);
      setShowCancelModal(false);
      setActionSuccess('Booking cancelled.');
    } catch (err: any) {
      setCancelError(err.message || 'Failed to cancel booking.');
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status: BookingStatus) => {
    switch (status) {
      case BookingStatus.PENDING_CONFIRMATION:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-4 h-4" /> Action Required: Please Confirm
          </span>
        );
      case BookingStatus.CONFIRMED:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <CheckCircle2 className="w-4 h-4" /> Confirmed
          </span>
        );
      case BookingStatus.IN_PROGRESS:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            <PlayCircle className="w-4 h-4" /> Work In Progress
          </span>
        );
      case BookingStatus.COMPLETED:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-4 h-4" /> Completed Work
          </span>
        );
      case BookingStatus.CANCELLED:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-4 h-4" /> Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
            {status}
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500">Loading your contract agreement...</p>
        </div>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-xl mx-auto bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-slate-900 mb-2">Booking Not Found</h2>
          <p className="text-sm text-slate-600 mb-6">{error || 'Unable to retrieve contract details.'}</p>
          <Link href="/worker/bookings">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to My Bookings
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Navigation */}
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/worker/bookings"
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to My Bookings
          </Link>
          {getStatusBadge(booking.status)}
        </div>

        {/* Alerts */}
        {actionSuccess && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <p className="text-sm font-medium">{actionSuccess}</p>
          </div>
        )}

        {/* Main Contract Snapshot Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
          <div className="p-6 sm:p-8 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-indigo-50/20">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">
                  Contract Agreement #{booking.id.slice(0, 8)}
                </span>
                <h1 className="text-2xl font-bold text-slate-900 mt-1">
                  {booking.jobTitle}
                </h1>
                <p className="text-sm text-slate-600 mt-1 flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-slate-400" />
                  Category: {booking.jobCategory}
                </p>
              </div>

              <div className="sm:text-right">
                <span className="text-xs text-slate-500">Total Agreed Payment</span>
                <div className="text-2xl font-bold text-slate-900 flex items-center sm:justify-end gap-1">
                  <IndianRupee className="w-5 h-5" />
                  {booking.totalAmount.toLocaleString('en-IN')}
                </div>
                <p className="text-xs text-slate-500">
                  ₹{booking.agreedWage} / {booking.wageType.toLowerCase()} • {booking.durationDays}{' '}
                  {booking.durationDays === 1 ? 'day' : 'days'}
                </p>
              </div>
            </div>
          </div>

          {/* Details Grid */}
          <div className="p-6 sm:p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Employer Details */}
            <div className="p-5 rounded-xl border border-slate-100 bg-slate-50/50">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                <Building className="w-4 h-4 text-indigo-500" /> Hiring Employer
              </h3>
              <p className="text-base font-bold text-slate-900">{booking.employer.businessName}</p>
              <p className="text-xs text-slate-600 mt-1">
                Business Type: {booking.employer.businessType || 'General Enterprise'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {booking.employer.locality ? `${booking.employer.locality}, ` : ''}
                {booking.employer.city || ''}
              </p>
            </div>

            {/* Schedule & Timing */}
            <div className="p-5 rounded-xl border border-slate-100 bg-slate-50/50">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-500" /> Engagement Schedule
              </h3>
              <p className="text-sm font-semibold text-slate-800">
                Start: {booking.startDate} {booking.endDate ? `to ${booking.endDate}` : ''}
              </p>
              <p className="text-xs text-slate-600 mt-1 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                Working Hours:{' '}
                {booking.startTime
                  ? `${booking.startTime} - ${booking.endTime || 'Wrap'}`
                  : 'Standard full-day'}
              </p>
              <p className="text-xs text-slate-600 mt-1 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                Duration: {booking.durationDays} calendar days
              </p>
            </div>

            {/* Location */}
            <div className="p-5 rounded-xl border border-slate-100 bg-slate-50/50 md:col-span-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-indigo-500" /> Work Site Location
              </h3>
              <p className="text-sm font-medium text-slate-800">
                {booking.workLocationAddress ? `${booking.workLocationAddress}, ` : ''}
                {booking.workLocationLocality}, {booking.workLocationCity}
                {booking.workLocationState ? `, ${booking.workLocationState}` : ''}
                {booking.workLocationPinCode ? ` - ${booking.workLocationPinCode}` : ''}
              </p>
            </div>
          </div>

          {/* Cancellation Info (if cancelled) */}
          {booking.status === BookingStatus.CANCELLED && (
            <div className="mx-6 sm:mx-8 mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200">
              <h4 className="text-xs font-bold text-rose-800 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <XCircle className="w-4 h-4 text-rose-600" /> Cancellation Notice
              </h4>
              <p className="text-sm text-rose-700">
                Reason: "{booking.cancellationReason || 'No reason provided'}"
              </p>
              <p className="text-xs text-rose-600 mt-1">
                Cancelled by: {booking.cancelledByRole || 'SYSTEM'} on{' '}
                {booking.cancelledAt ? new Date(booking.cancelledAt).toLocaleString() : 'N/A'}
              </p>
            </div>
          )}

          {/* Lifecycle Action Bar */}
          <div className="p-6 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
            <span className="text-xs text-slate-500">
              Contract Initiated: {new Date(booking.createdAt).toLocaleDateString()}
            </span>

            <div className="flex items-center gap-3">
              {booking.status !== BookingStatus.COMPLETED &&
                booking.status !== BookingStatus.CANCELLED && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowCancelModal(true)}
                    disabled={actionLoading}
                    className="border-rose-300 text-rose-700 hover:bg-rose-50"
                  >
                    Cancel Booking
                  </Button>
                )}

              {booking.status === BookingStatus.PENDING_CONFIRMATION && (
                <Button
                  size="sm"
                  onClick={handleConfirm}
                  disabled={actionLoading}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" /> Confirm Contract Offer
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Cancellation Modal */}
        {showCancelModal && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
              <h3 className="text-lg font-bold text-slate-900 mb-2">Cancel Booking Contract</h3>
              <p className="text-xs text-slate-600 mb-4">
                Please provide a reason why you cannot take up this engagement.
              </p>

              {cancelError && (
                <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                  {cancelError}
                </div>
              )}

              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Personal emergency or conflicting commitment."
                rows={3}
                className="w-full text-sm p-3 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500 mb-4"
              />

              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCancelModal(false)}
                  disabled={actionLoading}
                >
                  Keep Contract
                </Button>
                <Button
                  size="sm"
                  onClick={handleCancel}
                  disabled={actionLoading}
                  className="bg-rose-600 hover:bg-rose-700"
                >
                  Confirm Cancellation
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
