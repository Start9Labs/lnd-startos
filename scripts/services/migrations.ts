import { types as T, rangeOf } from "../deps.ts"

import { migration_up_0_14_2_1 } from "../migrations/0_14_2_1__up_migration.ts";
import { migration_down_0_14_2_1 } from "../migrations/_0_14_2_1_down_migration.ts";

// version here is where you are coming from ie. the version the service is currently on
export const migration: T.ExpectedExports.migration = async (effects, version) => {

    // from migrations (upgrades)
    if (rangeOf('<=0.14.2.1').check(version)) {
        const result = await migration_up_0_14_2_1(effects,version)
        return result
    }

    // to migrations (downgrades)
    if (rangeOf('>0.14.2.1').check(version)) {
        const result = await migration_down_0_14_2_1(effects, version)
        return result
    }

    return { result: { configured: true } }

}