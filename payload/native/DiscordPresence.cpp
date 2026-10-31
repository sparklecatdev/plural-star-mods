#include <jni.h>
#include <memory>
#include <string>
#include "discordpp.h"

static std::unique_ptr<discordpp::Client> client;
extern "C" JNIEXPORT void JNICALL Java_dev_sparklecat_unlock_DiscordPresenceModule_initializeClient(JNIEnv *, jclass) {
    client = std::make_unique<discordpp::Client>();
    client->SetApplicationId(1566174520350347434ULL);
}
extern "C" JNIEXPORT void JNICALL Java_dev_sparklecat_unlock_DiscordPresenceModule_update(JNIEnv *env, jclass, jbyteArray bytes) {
    if (!client || !bytes) return;
    const auto size = env->GetArrayLength(bytes);
    std::string text(size, '\0');
    env->GetByteArrayRegion(bytes, 0, size, reinterpret_cast<jbyte *>(&text[0]));
    discordpp::Activity activity;
    activity.SetType(discordpp::ActivityTypes::Playing);
    activity.SetDetails(text);
    activity.SetStatusDisplayType(discordpp::StatusDisplayTypes::Details);
    client->UpdateRichPresence(std::move(activity), [](discordpp::ClientResult) {});
}
extern "C" JNIEXPORT void JNICALL Java_dev_sparklecat_unlock_DiscordPresenceModule_clear(JNIEnv *, jclass) { if (client) client->ClearRichPresence(); }
extern "C" JNIEXPORT void JNICALL Java_dev_sparklecat_unlock_DiscordPresenceModule_pump(JNIEnv *, jclass) { discordpp::RunCallbacks(); }
extern "C" JNIEXPORT void JNICALL Java_dev_sparklecat_unlock_DiscordPresenceModule_shutdown(JNIEnv *, jclass) { client.reset(); }
