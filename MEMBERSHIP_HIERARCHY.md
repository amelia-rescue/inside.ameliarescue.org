# Membership Hierarchy System

## Overview

The membership hierarchy system provides a structured way to manage roles, tracks, and certifications for organization members.

## Architecture

### Core Entities

1. **Roles** (`aes_roles` table)
   - Represents membership roles (e.g., Provider, Driver, Junior)
   - Users can have multiple roles via the `membership_role` array field
   - Primary Key: `role_id`

2. **Tracks** (`aes_tracks` table)
   - Represents certification tracks (e.g., EMT, Paramedic, Driver Basic)
   - Each role can have 0 or 1 track assigned to a user
   - Contains `required_certifications` array listing which certifications are needed
   - Primary Key: `track_id`

3. **Certification Types** (`aes_certification_types` table)
   - Defines types of certifications (e.g., EMT-B, CPR, EVOC)
   - Primary Key: `name`

4. **User Certifications** (`aes_user_certifications` table)
   - Actual certification documents uploaded by users
   - Links users to certification types
   - Primary Key: `certification_id`

### Association Tables

1. **Role-Track Associations** (`aes_role_tracks` table)
   - Defines which tracks are allowed for which roles
   - Example: Paramedic track is allowed for Provider role, but NOT for Driver role
   - Composite Primary Key: `role_id` + `track_id`
   - GSI: `TrackIdIndex` on `track_id`

## Data Flow

```
User (membership_role: ["provider", "driver"])
  ↓
Role: "provider"
  ↓
Allowed Tracks: ["emt", "paramedic"] (via role-track associations)
  ↓
Selected Track: "emt"
  ↓
Track Object: { track_id: "emt", required_certifications: ["EMT-B", "CPR"] }
  ↓
User must have valid EMT-B and CPR certifications
```

## Stores

### RoleStore (`role-store.ts`)
- `createRole(role: Role)`
- `getRole(role_id: string)`
- `updateRole(role: Role)`
- `deleteRole(role_id: string)`
- `listRoles()`

### TrackStore (`track-store.ts`)
- `createTrack(track: Track)` - Track includes `required_certifications` array
- `getTrack(track_id: string)`
- `updateTrack(track: Track)`
- `deleteTrack(track_id: string)`
- `listTracks()`

### RoleTrackStore (`role-track-store.ts`)
- `createRoleTrack(roleTrack: RoleTrack)`
- `getRoleTrack(role_id: string, track_id: string)`
- `deleteRoleTrack(role_id: string, track_id: string)`
- `listTracksByRole(role_id: string)`
- `listRolesByTrack(track_id: string)`
- `isTrackAllowedForRole(role_id: string, track_id: string)`

### MembershipService (`membership-service.ts`)
High-level service that orchestrates the hierarchy:
- `validateRoleTrackCombination(role_id: string, track_id: string)`
- `getTracksForRole(role_id: string)`
- `getRequiredCertificationsForTrack(track_id: string)` - Reads from track's `required_certifications`
- `getTracksForCertification(certification_type_name: string)` - Scans tracks to find which require this cert
- `validateUserTrackEligibility(user_id: string, role_id: string, track_id: string)`
- `getUserEligibleTracks(user_id: string, role_id: string)`
- `addTrackToRole(role_id: string, track_id: string)`
- `removeTrackFromRole(role_id: string, track_id: string)`
- `addCertificationToTrack(track_id: string, certification_type_name: string)` - Updates track's array
- `removeCertificationFromTrack(track_id: string, certification_type_name: string)` - Updates track's array

## Example Usage

```typescript
import { MembershipService } from "./lib/membership-service";

const service = new MembershipService();

// Check if a user is eligible for a track
const eligibility = await service.validateUserTrackEligibility(
  "user-123",
  "provider",
  "emt"
);

if (!eligibility.valid) {
  console.log("Missing certifications:", eligibility.missingCertifications);
}

// Get all tracks a user is eligible for
const eligibleTracks = await service.getUserEligibleTracks(
  "user-123",
  "provider"
);

// Add a new track to a role
await service.addTrackToRole("provider", "paramedic");

// Add a certification requirement to a track (updates the track's required_certifications array)
await service.addCertificationToTrack("emt", "CPR");

// Or create a track with certifications directly
const trackStore = TrackStore.make();
await trackStore.createTrack({
  track_id: "advanced_emt",
  name: "Advanced EMT",
  description: "Advanced EMT track",
  required_certifications: ["AEMT", "CPR", "ACLS"]
});
```

## Database Schema Requirements

When setting up DynamoDB tables, ensure the following:

1. **aes_roles**: Partition key = `role_id`
2. **aes_tracks**: 
   - Partition key = `track_id`
   - Attributes include `required_certifications` (string array)
3. **aes_role_tracks**: 
   - Partition key = `role_id`
   - Sort key = `track_id`
   - GSI: `TrackIdIndex` with partition key = `track_id`

## User Schema

The user schema in `user-store.ts` includes:
```typescript
{
  user_id: "string",
  first_name: "string",
  last_name: "string",
  email: "string",
  website_role: "'admin' | 'user'",
  membership_role: "string[]",  // Array of role_ids
  phone?: "string"
}
```

Users can have multiple membership roles (e.g., `["provider", "driver"]`), allowing them to fulfill multiple functions within the organization.
