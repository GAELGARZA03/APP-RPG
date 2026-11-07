package com.gaelgarza.realliferpg;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Guarda secretos (como la API key de Gemini) cifrados con una llave del Android Keystore.
 * La llave nunca sale del teléfono, y el archivo cifrado está excluido de los respaldos de Android.
 */
@CapacitorPlugin(name = "SecretStore")
public class SecretStorePlugin extends Plugin {

    private static final String KEY_ALIAS = "rlrpg_secret_key";
    private static final String PREFS_NAME = "rlrpg_secrets";
    private static final int IV_LENGTH = 12;
    private static final int TAG_LENGTH_BITS = 128;

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private SecretKey secretKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) {
            return ((KeyStore.SecretKeyEntry) keyStore.getEntry(KEY_ALIAS, null)).getSecretKey();
        }

        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(
            new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        );
        return generator.generateKey();
    }

    private static String requireName(PluginCall call) {
        String name = call.getString("name");
        if (name == null || name.isEmpty()) {
            call.reject("Falta el nombre del secreto");
            return null;
        }
        return name;
    }

    @PluginMethod
    public void set(PluginCall call) {
        String name = requireName(call);
        String value = call.getString("value");
        if (name == null) return;
        if (value == null) {
            call.reject("Falta el valor del secreto");
            return;
        }

        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, secretKey());
            byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            byte[] payload = ByteBuffer.allocate(cipher.getIV().length + encrypted.length)
                .put(cipher.getIV())
                .put(encrypted)
                .array();
            prefs().edit().putString(name, Base64.encodeToString(payload, Base64.NO_WRAP)).apply();
            call.resolve();
        } catch (Exception error) {
            call.reject("No se pudo guardar el secreto", error);
        }
    }

    @PluginMethod
    public void get(PluginCall call) {
        String name = requireName(call);
        if (name == null) return;

        JSObject result = new JSObject();
        String stored = prefs().getString(name, null);
        if (stored == null) {
            result.put("value", JSObject.NULL);
            call.resolve(result);
            return;
        }

        try {
            byte[] payload = Base64.decode(stored, Base64.NO_WRAP);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, secretKey(), new GCMParameterSpec(TAG_LENGTH_BITS, payload, 0, IV_LENGTH));
            byte[] decrypted = cipher.doFinal(payload, IV_LENGTH, payload.length - IV_LENGTH);
            result.put("value", new String(decrypted, StandardCharsets.UTF_8));
        } catch (Exception error) {
            // Si el dato no se puede descifrar (por ejemplo, la llave del Keystore cambió), se descarta.
            prefs().edit().remove(name).apply();
            result.put("value", JSObject.NULL);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String name = requireName(call);
        if (name == null) return;
        prefs().edit().remove(name).apply();
        call.resolve();
    }
}
