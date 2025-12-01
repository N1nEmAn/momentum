# Group View Enhancements

## Summary
Implemented enhancements for the Task Group view to improve parity with single chain views and add requested features.

## Changes

### 1. Individual Task Timers
- **Refactoring**: Extracted task rendering logic from `GroupView` into a new `UnitCard` component.
- **Feature**: Each `UnitCard` now maintains its own `timeRemaining` state and countdown timer.
- **Benefit**: Users can see the countdown for scheduled tasks directly within the group view, just like in the single chain view.

### 2. Auxiliary Streak Display
- **Feature**: Added display of "Appointment Counts" (Auxiliary Streak) to the task card.
- **UI**: Added a calendar-check icon with the count `#{unit.auxiliaryStreak || 0}`.

### 3. Click-to-View Details
- **Feature**: Clicking on a task card (outside of buttons) now triggers the detail view for that specific chain.
- **Implementation**:
    - Added `onViewDetail` prop to `GroupView` and `UnitCard`.
    - Connected `App.tsx`'s `handleViewChainDetail` to `GroupView`.
    - Added `onClick` handler to the main card container in `UnitCard`.

## Technical Details
- **File**: `src/components/GroupView.tsx`
    - Created `UnitCard` component.
    - Removed unused `renderUnit` function.
    - Updated `GroupView` to render `UnitCard` components.
- **File**: `src/App.tsx`
    - Passed `onViewDetail={handleViewChainDetail}` to `GroupView`.

## Verification
- **Linting**: All TypeScript errors and unused variable warnings have been resolved.
- **Integration**: `App.tsx` correctly passes the required props.
