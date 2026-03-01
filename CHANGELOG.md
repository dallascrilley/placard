# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added

#### New Tools
- **`meta_delete_campaign`** - Soft-delete a campaign by setting status to DELETED
- **`meta_delete_adset`** - Soft-delete an ad set by setting status to DELETED
- **`meta_delete_ad`** - Soft-delete an ad by setting status to DELETED

#### Campaign Tools
- **`meta_create_campaign`**:
  - Added `special_ad_category_country` parameter (array of ISO country codes, required when using HOUSING, EMPLOYMENT, CREDIT, or ISSUES_ELECTIONS_POLITICS categories)
  - Added `spend_cap` parameter (hard cap on total campaign spend in cents)
  - Added `promoted_object` parameter for event/app campaigns
  - Added validation requiring `special_ad_category_country` when using certain special ad categories

- **`meta_update_campaign`**:
  - Added `spend_cap` parameter

#### Ad Set Tools
- **`meta_create_adset`**:
  - Added `destination_type` parameter (where users go after click: PHONE_CALL, MESSENGER, WHATSAPP, FACEBOOK, WEBSITE, etc.)
  - Added `is_dynamic_creative` parameter (enable Advantage+ dynamic creative)
  - Added `pacing_type` parameter (delivery speed: standard, no_pacing, day_parting)
  - Added geo radius validation (cities: 10-50 mi / 17-80 km, custom locations: 0.63-50 mi / 1-80 km)
  - Added `promoted_object` constraint validation (EVENT_RESPONSES optimization does not support promoted_object.event_id)
  - Enhanced documentation for Advantage+ audience age_max constraint (must be 65)

- **`meta_update_adset`**:
  - Added `pacing_type` parameter
  - Added `promoted_object` parameter

#### Constants
- Added `DESTINATION_TYPES` constant with values: UNDEFINED, WEBSITE, APP, MESSENGER, WHATSAPP, PHONE_CALL, FACEBOOK, INSTAGRAM_PROFILE, INSTAGRAM_DIRECT, MESSAGING_MESSENGER_WHATSAPP
- Added `PACING_TYPES` constant with values: standard, no_pacing, day_parting

### Changed

#### Validations
- Enhanced targeting validation for Advantage+ audience age constraints
- Added geo_locations radius validation to prevent API errors
- Added promoted_object compatibility checks for different optimization goals

### Fixed
- Improved error messages for special ad category country requirements
- Enhanced parameter documentation with constraint details and examples

## Previous Versions

See git commit history for changes prior to this changelog.
