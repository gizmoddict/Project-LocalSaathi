'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Input } from '@localsaathi/ui';
import {
  ChevronLeft,
  Plus,
  Trash2,
  Wrench,
  AlertCircle,
} from 'lucide-react';
import { SkillProficiency } from '@localsaathi/types';

interface ListedSkill {
  id: string;
  name: string;
  category: string;
  proficiency: SkillProficiency;
  experienceYears: number;
}

const CATALOG_SUGGESTIONS = [
  { name: 'Plumbing', category: 'Plumbing' },
  { name: 'Pipe Fitting', category: 'Plumbing' },
  { name: 'Electrical Wiring', category: 'Electrical' },
  { name: 'Appliance Repair', category: 'Electrical' },
  { name: 'Carpentry', category: 'Carpentry' },
  { name: 'Furniture Assembly', category: 'Carpentry' },
  { name: 'Masonry', category: 'Construction' },
  { name: 'Tile Laying', category: 'Construction' },
  { name: 'House Painting', category: 'Painting' },
  { name: 'Deep Cleaning', category: 'Cleaning' },
];

export default function WorkerSkillsPage() {
  const [skills, setSkills] = useState<ListedSkill[]>([
    {
      id: 'ws-1',
      name: 'Plumbing',
      category: 'Plumbing',
      proficiency: SkillProficiency.EXPERT,
      experienceYears: 7,
    },
    {
      id: 'ws-2',
      name: 'Pipe Fitting',
      category: 'Plumbing',
      proficiency: SkillProficiency.INTERMEDIATE,
      experienceYears: 4,
    },
  ]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProficiency, setSelectedProficiency] = useState<SkillProficiency>(
    SkillProficiency.INTERMEDIATE
  );
  const [experienceYears, setExperienceYears] = useState(3);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleAddSkill = (skillName: string, category: string = 'General') => {
    setErrorMsg(null);
    const normalized = skillName.trim().toLowerCase();

    // Check duplicate
    if (skills.some((s) => s.name.toLowerCase() === normalized)) {
      setErrorMsg(`You have already added "${skillName}" to your skills`);
      return;
    }

    const newSkill: ListedSkill = {
      id: `ws-${Date.now()}`,
      name: skillName.trim(),
      category,
      proficiency: selectedProficiency,
      experienceYears,
    };

    setSkills((prev) => [...prev, newSkill]);
    setSearchQuery('');
  };

  const handleRemoveSkill = (id: string) => {
    setSkills((prev) => prev.filter((s) => s.id !== id));
  };

  const filteredCatalog = CATALOG_SUGGESTIONS.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Navigation */}
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/worker"
          className="text-xs font-semibold text-slate-500 hover:text-slate-900 flex items-center gap-1"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <h1 className="text-xl font-bold text-slate-900 mb-1 flex items-center gap-2">
          <Wrench className="w-5 h-5 text-emerald-600" />
          Trades & Technical Skills
        </h1>
        <p className="text-sm text-slate-500 mb-6">
          Specify your exact trade skills, proficiency levels, and years of experience to match with relevant local job requests.
        </p>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {errorMsg}
          </div>
        )}

        {/* Add Skill Panel */}
        <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 mb-6">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Add Skill to Profile</h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <div className="sm:col-span-1">
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                Proficiency
              </label>
              <select
                className="w-full rounded-md border border-slate-300 p-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={selectedProficiency}
                onChange={(e) => setSelectedProficiency(e.target.value as SkillProficiency)}
              >
                <option value={SkillProficiency.BEGINNER}>Beginner</option>
                <option value={SkillProficiency.INTERMEDIATE}>Intermediate</option>
                <option value={SkillProficiency.EXPERT}>Expert</option>
              </select>
            </div>

            <div className="sm:col-span-1">
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                Years of Experience
              </label>
              <Input
                type="number"
                min={0}
                max={50}
                value={experienceYears}
                onChange={(e) => setExperienceYears(parseInt(e.target.value) || 0)}
              />
            </div>

            <div className="sm:col-span-1">
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                Search or Type Skill
              </label>
              <div className="relative">
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="e.g. Masonry"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && searchQuery.trim()) {
                      handleAddSkill(searchQuery.trim());
                    }
                  }}
                />
              </div>
            </div>
          </div>

          {searchQuery.trim() && (
            <div className="mt-3">
              <span className="text-xs text-slate-500 font-medium">Quick Suggestions:</span>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {filteredCatalog.slice(0, 5).map((cat) => (
                  <button
                    key={cat.name}
                    type="button"
                    onClick={() => handleAddSkill(cat.name, cat.category)}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    {cat.name}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => handleAddSkill(searchQuery.trim())}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-slate-200 text-slate-800 hover:bg-slate-300 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Add Custom &quot;{searchQuery}&quot;
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Existing Skills List */}
        <div>
          <h3 className="text-sm font-bold text-slate-800 mb-3">
            Current Listed Skills ({skills.length})
          </h3>
          <div className="space-y-2">
            {skills.map((skill) => (
              <div
                key={skill.id}
                className="flex items-center justify-between p-4 rounded-lg border border-slate-200 bg-white"
              >
                <div>
                  <span className="font-semibold text-sm text-slate-900">{skill.name}</span>
                  <span className="ml-2 text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-medium">
                    {skill.proficiency}
                  </span>
                  <span className="ml-2 text-xs text-slate-500">
                    {skill.experienceYears} Years Experience
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleRemoveSkill(skill.id)}
                  className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                  title="Remove Skill"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
