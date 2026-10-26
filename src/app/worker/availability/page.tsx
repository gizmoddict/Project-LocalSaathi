'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, Input } from '@localsaathi/ui';
import {
  ChevronLeft,
  Plus,
  Trash2,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { AvailabilityStatus } from '@localsaathi/types';

interface AvailabilitySlot {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  status: AvailabilityStatus;
}

export default function WorkerAvailabilityPage() {
  const [slots, setSlots] = useState<AvailabilitySlot[]>([
    {
      id: 'slot-1',
      date: '2026-10-05',
      startTime: '08:00',
      endTime: '17:00',
      status: AvailabilityStatus.AVAILABLE,
    },
    {
      id: 'slot-2',
      date: '2026-10-06',
      startTime: '08:00',
      endTime: '17:00',
      status: AvailabilityStatus.AVAILABLE,
    },
  ]);

  const [newDate, setNewDate] = useState('2026-10-07');
  const [newStartTime, setNewStartTime] = useState('08:00');
  const [newEndTime, setNewEndTime] = useState('17:00');
  const [isAdding, setIsAdding] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleAddSlot = () => {
    setErrorMsg(null);
    if (!newDate) {
      setErrorMsg('Please select a valid date');
      return;
    }
    if (newStartTime >= newEndTime) {
      setErrorMsg('Start time must be chronologically earlier than end time');
      return;
    }

    const newSlot: AvailabilitySlot = {
      id: `slot-${Date.now()}`,
      date: newDate,
      startTime: newStartTime,
      endTime: newEndTime,
      status: AvailabilityStatus.AVAILABLE,
    };

    setSlots((prev) => [...prev, newSlot]);
    setIsAdding(false);
  };

  const handleDeleteSlot = (id: string) => {
    setSlots((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Navigation */}
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/worker"
          className="text-xs font-semibold text-slate-500 hover:text-slate-900 flex items-center gap-1"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>
        {!isAdding && (
          <Button variant="primary" size="sm" onClick={() => setIsAdding(true)}>
            <Plus className="w-4 h-4 mr-1" />
            Add Schedule Slot
          </Button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <h1 className="text-xl font-bold text-slate-900 mb-1 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-emerald-600" />
          Work Availability Schedule
        </h1>
        <p className="text-sm text-slate-500 mb-6">
          Set the specific dates and daily working hours you are available for nearby job dispatch.
        </p>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {errorMsg}
          </div>
        )}

        {/* Add Slot Form */}
        {isAdding && (
          <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 mb-6">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Add Work Availability Slot</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Date</label>
                <Input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Start Time</label>
                <Input
                  type="time"
                  value={newStartTime}
                  onChange={(e) => setNewStartTime(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">End Time</label>
                <Input
                  type="time"
                  value={newEndTime}
                  onChange={(e) => setNewEndTime(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsAdding(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleAddSlot}>
                Confirm Slot
              </Button>
            </div>
          </div>
        )}

        {/* Slots List */}
        <div className="space-y-3">
          {slots.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">
              No availability slots scheduled. Click &quot;Add Schedule Slot&quot; to set your working days.
            </p>
          ) : (
            slots.map((slot) => (
              <div
                key={slot.id}
                className="flex items-center justify-between p-4 rounded-lg border border-slate-200 bg-white hover:border-slate-300 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-slate-900">{slot.date}</div>
                    <div className="text-xs text-slate-500">
                      Working Window: {slot.startTime} to {slot.endTime}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Available
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeleteSlot(slot.id)}
                    className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                    title="Delete Slot"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
