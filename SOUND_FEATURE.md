# Sound Notification Feature

## Summary
Implemented a sound notification system that plays a "ring" (double beep) when any countdown timer ends.

## Changes

### 1. Sound Manager
- **File**: `src/utils/soundManager.ts`
- **Description**: Created a `SoundManager` class using the Web Audio API to generate beep sounds without external assets.
- **Method**: `playTimerFinished()` plays a double beep (880Hz).

### 2. Integration Points
- **Active Session**: `src/components/FocusMode.tsx`
    - Plays sound when the focus session timer reaches 0.
- **Group View**: `src/components/GroupView.tsx`
    - Plays sound when an individual task's scheduled timer reaches 0.
- **Single Chain**: `src/components/ChainCard.tsx`
    - Plays sound when a scheduled chain's timer reaches 0.
- **Global Check**: `src/App.tsx`
    - Plays sound when the background check detects expired sessions (fallback for when user is on a different view).

## Logic
- Uses `useRef` to track if the sound has already been played for a specific session/expiration time to prevent duplicate sounds or loops.
- `App.tsx` acts as a safety net to ensure the user is notified even if the specific component is unmounted.
