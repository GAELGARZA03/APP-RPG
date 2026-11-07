package com.gaelgarza.realliferpg;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PowerSettingsPlugin.class);
        registerPlugin(SecretStorePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
