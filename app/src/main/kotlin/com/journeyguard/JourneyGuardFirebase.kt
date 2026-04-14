package com.journeyguard

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions

object JourneyGuardFirebase {

    fun ensureInitialized(context: Context) {
        if (FirebaseApp.getApps(context).isNotEmpty()) {
            return
        }

        val options = FirebaseOptions.Builder()
            .setApiKey("AIzaSyBd2ZtpRMXC5cqHioODxvnEA8NDc7XiBxs")
            .setApplicationId("1:160169757616:web:508ea1f2923cca48c5e475")
            .setProjectId("journeyguard")
            .setDatabaseUrl("https://journeyguard-default-rtdb.firebaseio.com")
            .setGcmSenderId("160169757616")
            .setStorageBucket("journeyguard.firebasestorage.app")
            .build()

        FirebaseApp.initializeApp(context, options)
    }
}
