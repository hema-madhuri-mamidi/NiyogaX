/**
 * useJobFilter.js
 *
 * PURPOSE:
 *   A simple React Context + hook to share job filter state between:
 *   - NiyoAssistant (writes the filter when user says "show painting jobs")
 *   - JobsPage      (reads the filter and shows filtered results)
 *
 * USAGE:
 *
 *   // 1. Wrap your app (in App.jsx or index.jsx):
 *   import { JobFilterProvider } from './hooks/useJobFilter';
 *   <JobFilterProvider>
 *     <App />
 *   </JobFilterProvider>
 *
 *   // 2. In JobsPage.jsx — read the filter:
 *   import { useJobFilter } from '../hooks/useJobFilter';
 *   const { jobFilter, setJobFilter } = useJobFilter();
 *
 *   // 3. In App.jsx handleAssistantNavigate — write the filter:
 *   import { useJobFilter } from './hooks/useJobFilter';
 *   const { setJobFilter } = useJobFilter();
 *   // inside handleAssistantNavigate:
 *   setJobFilter(filter);
 */

import React, { createContext, useContext, useState } from 'react';

const JobFilterContext = createContext(null);

/**
 * JobFilterProvider
 * Wrap your app root with this to share filter state everywhere.
 */
export function JobFilterProvider({ children }) {
  const [jobFilter, setJobFilter] = useState(null);

  return (
    <JobFilterContext.Provider value={{ jobFilter, setJobFilter }}>
      {children}
    </JobFilterContext.Provider>
  );
}

/**
 * useJobFilter()
 * Returns { jobFilter, setJobFilter }
 *
 * jobFilter: string|null — e.g. 'Painting', 'Driving', null (= all jobs)
 */
export function useJobFilter() {
  const ctx = useContext(JobFilterContext);
  if (!ctx) {
    throw new Error('useJobFilter must be used inside <JobFilterProvider>');
  }
  return ctx;
}
