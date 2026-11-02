# Release shrinker rules (issue #267).
#
# kotlinx-serialization, Retrofit 3 and OkHttp ship consumer rules that keep
# serializers of *reachable* @Serializable classes and Retrofit interfaces.
# The gap: a Retrofit response type the app never reads (e.g. FocusCommandDto
# — the repository discards it) gets removed, its generic signature collapses
# to Continuation<Object>, and the kotlinx converter throws "Serializer for
# class 'Any' is not found" at call time. Keep every wire DTO (names may still
# be obfuscated; serial names live in the generated descriptors).
-keep,allowobfuscation @kotlinx.serialization.Serializable class com.familyplanz.app.data.** { *; }

# Issue #271: the persisted reminder set (scheduled-reminders.json) is
# kotlinx-serialized; keep it like the wire DTOs. Receivers are manifest
# entries, which AAPT already keeps.
-keep,allowobfuscation @kotlinx.serialization.Serializable class com.familyplanz.app.reminders.** { *; }
