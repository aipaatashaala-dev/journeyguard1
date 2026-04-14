package com.journeyguard

import android.content.Context

object ProtectionPreferences {

    private const val PREFS_NAME = "journeyguard_protection"
    private const val KEY_ACTIVE = "active"

    fun isProtectionExpected(context: Context): Boolean {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getBoolean(KEY_ACTIVE, false)
    }

    fun setProtectionExpected(context: Context, active: Boolean) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_ACTIVE, active)
            .apply()
    }
}
