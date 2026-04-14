package com.journeyguard

import com.google.firebase.auth.ktx.auth
import com.google.firebase.ktx.Firebase
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

data class RemoteProtectionState(
    val active: Boolean = false,
    val locationEnabled: Boolean = false,
    val email: String? = null,
    val updatedAt: Long = 0L,
    val startedAt: Long = 0L,
    val lat: Double? = null,
    val lng: Double? = null,
    val accuracy: Double? = null,
    val source: String? = null,
    val ringRequestedAt: Long = 0L,
    val ringStopRequestedAt: Long = 0L,
)

object ProtectionRemoteApi {

    private suspend fun idToken(): String {
        val user = Firebase.auth.currentUser ?: error("No authenticated user")
        return user.getIdToken(true).await().token ?: error("Could not get auth token")
    }

    suspend fun getProtectionState(): RemoteProtectionState = request(
        path = "/protection/state",
        method = "GET",
        body = null
    )

    suspend fun startProtection(locationEnabled: Boolean): RemoteProtectionState = request(
        path = "/protection/start",
        method = "POST",
        body = JSONObject()
            .put("location_enabled", locationEnabled)
            .put("source", "mobile-device")
    )

    suspend fun stopProtection(): RemoteProtectionState = request(
        path = "/protection/stop",
        method = "POST",
        body = JSONObject().put("source", "mobile-device")
    )

    suspend fun updateProtectionLocation(
        lat: Double,
        lng: Double,
        accuracy: Float?,
        locationEnabled: Boolean
    ): RemoteProtectionState = request(
        path = "/protection/location",
        method = "POST",
        body = JSONObject()
            .put("lat", lat)
            .put("lng", lng)
            .put("accuracy", accuracy?.toDouble())
            .put("location_enabled", locationEnabled)
            .put("source", "mobile-device")
    )

    suspend fun startRing(): RemoteProtectionState = request(
        path = "/protection/ring/start",
        method = "POST",
        body = JSONObject().put("source", "mobile-device")
    )

    suspend fun stopRing(): RemoteProtectionState = request(
        path = "/protection/ring/stop",
        method = "POST",
        body = JSONObject().put("source", "mobile-device")
    )

    private suspend fun request(
        path: String,
        method: String,
        body: JSONObject?
    ): RemoteProtectionState = withContext(Dispatchers.IO) {
        val connection = (URL("${BuildConfig.API_BASE_URL}$path").openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 15000
            readTimeout = 15000
            setRequestProperty("Authorization", "Bearer ${idToken()}")
            setRequestProperty("Accept", "application/json")
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
            }
        }

        try {
            if (body != null) {
                OutputStreamWriter(connection.outputStream).use { writer ->
                    writer.write(body.toString())
                }
            }

            val responseCode = connection.responseCode
            val stream = if (responseCode in 200..299) {
                connection.inputStream
            } else {
                connection.errorStream
            }

            val payload = stream?.let {
                BufferedReader(InputStreamReader(it)).use { reader ->
                    buildString {
                        var line = reader.readLine()
                        while (line != null) {
                            append(line)
                            line = reader.readLine()
                        }
                    }
                }
            }.orEmpty()

            if (responseCode !in 200..299) {
                val detail = runCatching { JSONObject(payload).optString("detail") }.getOrNull()
                error(detail?.takeIf { it.isNotBlank() } ?: "HTTP $responseCode")
            }

            parseState(JSONObject(payload))
        } finally {
            connection.disconnect()
        }
    }

    private fun parseState(json: JSONObject): RemoteProtectionState {
        return RemoteProtectionState(
            active = json.optBoolean("active", false),
            locationEnabled = json.optBoolean("location_enabled", false),
            email = json.optString("email").ifBlank { null },
            updatedAt = json.optLong("updated_at", 0L),
            startedAt = json.optLong("started_at", 0L),
            lat = json.optNullableDouble("lat"),
            lng = json.optNullableDouble("lng"),
            accuracy = json.optNullableDouble("accuracy"),
            source = json.optString("source").ifBlank { null },
            ringRequestedAt = json.optLong("ring_requested_at", 0L),
            ringStopRequestedAt = json.optLong("ring_stop_requested_at", 0L),
        )
    }

    private fun JSONObject.optNullableDouble(key: String): Double? {
        return if (isNull(key)) null else optDouble(key)
    }
}
