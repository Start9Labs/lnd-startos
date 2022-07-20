import { types as T, rangeOf } from "../deps.ts"

import { migration_up_0_15_0 } from "../migrations/0_15_0__up_migration.ts";
import { migration_down_0_15_0 } from "../migrations/0_15_0__down_migration.ts";

// version here is where you are coming from ie. the version the service is currently on
export const migration: T.ExpectedExports.migration = async (effects, version) => {

  // from migrations (upgrades)
  if (rangeOf('<=0.15.0').check(version)) {
    const result = await migration_up_0_15_0(effects,version)
    return result
  }

  // to migrations (downgrades)
  if (rangeOf('>0.15.0').check(version)) {
    const result = await migration_down_0_15_0(effects, version)
    return result
  }

  return { result: { configured: true } }

}