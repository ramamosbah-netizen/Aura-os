/**
 * API compatibility export. The canonical catalog lives in @aura/core so AccessService boot
 * seeding, the API seeder and authorization tests cannot drift into separate definitions.
 */
export {
  STANDARD_ELV_ROLES as ELV_ROLE_MATRIX,
  STANDARD_ELV_ROLE_IDS,
  type StandardElvRole as ElvRole,
} from '@aura/core';