/**
 * FB AI Post Manager - Options / Settings Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const providerRadios = document.querySelectorAll('input[name="aiProvider"]');
  const geminiConfigGroup = document.getElementById('geminiConfigGroup');
  const customConfigGroup = document.getElementById('customConfigGroup');

  const apiKeyInput = document.getElementById('apiKeyInput');
  const btnToggleKeyVis = document.getElementById('btnToggleKeyVis');
  const aiModelSelect = document.getElementById('aiModelSelect');
  const backendUrlInput = document.getElementById('backendUrlInput');

  const btnTestApi = document.getElementById('btnTestApi');
  const testApiStatus = document.getElementById('testApiStatus');

  const scanLimitSelect = document.getElementById('scanLimitSelect');
  const scanDelayInput = document.getElementById('scanDelayInput');
  const deleteDelayInput = document.getElementById('deleteDelayInput');

  const ruleMinQuality = document.getElementById('ruleMinQuality');
  const ruleMinEngagement = document.getElementById('ruleMinEngagement');
  const ruleMaxSpam = document.getElementById('ruleMaxSpam');
  const ruleMaxDuplicate = document.getElementById('ruleMaxDuplicate');

  const btnClearAllStorage = document.getElementById('btnClearAllStorage');
  const btnSaveSettings = document.getElementById('btnSaveSettings');
  const saveStatusMsg = document.getElementById('saveStatusMsg');

  // Load existing settings
  const settings = await StorageManager.getSettings();

  // Populate form
  providerRadios.forEach(radio => {
    if (radio.value === settings.aiProvider) radio.checked = true;
    radio.addEventListener('change', () => updateProviderVisibility());
  });

  const customModelGroup = document.getElementById('customModelGroup');
  const customModelInput = document.getElementById('customModelInput');

  apiKeyInput.value = settings.apiKey || '';
  let currentModel = settings.aiModel || 'gemini-3.6-flash';
  if (currentModel === 'gemini-2.0-flash') {
    currentModel = 'gemini-3.6-flash';
  }
  const knownModels = ['gemini-3.6-flash', 'gemini-3.6-pro', 'gemini-2.5-flash', 'gemini-1.5-flash'];
  if (knownModels.includes(currentModel)) {
    aiModelSelect.value = currentModel;
    customModelGroup.style.display = 'none';
  } else {
    aiModelSelect.value = 'custom';
    customModelGroup.style.display = 'block';
    customModelInput.value = currentModel;
  }

  aiModelSelect.addEventListener('change', () => {
    if (aiModelSelect.value === 'custom') {
      customModelGroup.style.display = 'block';
      customModelInput.focus();
    } else {
      customModelGroup.style.display = 'none';
    }
  });

  scanLimitSelect.value = String(settings.scanLimit || 500);
  scanDelayInput.value = settings.scanDelay || 2200;
  deleteDelayInput.value = settings.deleteBatchDelay || 2500;

  const rules = settings.rules || {};
  ruleMinQuality.value = rules.minQuality ?? 40;
  ruleMinEngagement.value = rules.minEngagement ?? 15;
  ruleMaxSpam.value = rules.maxSpam ?? 75;
  ruleMaxDuplicate.value = rules.maxDuplicate ?? 85;

  function updateProviderVisibility() {
    const selected = document.querySelector('input[name="aiProvider"]:checked').value;
    if (selected === 'gemini') {
      geminiConfigGroup.style.display = 'block';
      customConfigGroup.style.display = 'none';
    } else {
      geminiConfigGroup.style.display = 'none';
      customConfigGroup.style.display = 'block';
    }
  }
  updateProviderVisibility();

  // Toggle API Key visibility
  btnToggleKeyVis.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      btnToggleKeyVis.textContent = 'Hide';
    } else {
      apiKeyInput.type = 'password';
      btnToggleKeyVis.textContent = 'Show';
    }
  });

  // Test API Connection
  btnTestApi.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    if (!key) {
      testApiStatus.className = 'status-msg error';
      testApiStatus.textContent = 'Please enter a Gemini API Key first.';
      return;
    }

    testApiStatus.className = 'status-msg';
    testApiStatus.textContent = 'Testing connection...';

    try {
      const selectedModel = aiModelSelect.value === 'custom'
        ? (customModelInput.value.trim() || 'gemini-3.6-flash')
        : aiModelSelect.value;
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${key}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Respond with "OK"' }] }]
        })
      });

      if (res.ok) {
        testApiStatus.className = 'status-msg success';
        testApiStatus.textContent = 'Connection successful! API key is valid.';
      } else {
        const err = await res.json().catch(() => ({}));
        testApiStatus.className = 'status-msg error';
        testApiStatus.textContent = `API Error (${res.status}): ${err.error?.message || 'Invalid key or unauthorized'}`;
      }
    } catch (err) {
      testApiStatus.className = 'status-msg error';
      testApiStatus.textContent = `Network error: ${err.message}`;
    }
  });

  // Clear Storage
  btnClearAllStorage.addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear all stored Facebook scans and activity logs? This action cannot be undone.')) {
      await StorageManager.clearPosts();
      await chrome.storage.local.remove(['fb_ai_logs', 'fb_ai_scan_info']);
      alert('All cached post data and activity logs have been cleared.');
    }
  });

  // Save Settings
  btnSaveSettings.addEventListener('click', async () => {
    const selectedModel = aiModelSelect.value === 'custom'
      ? (customModelInput.value.trim() || 'gemini-3.6-flash')
      : aiModelSelect.value;

    const updated = {
      aiProvider: document.querySelector('input[name="aiProvider"]:checked').value,
      apiKey: apiKeyInput.value.trim(),
      aiModel: selectedModel,
      backendUrl: backendUrlInput.value.trim(),
      scanLimit: parseInt(scanLimitSelect.value, 10),
      scanDelay: parseInt(scanDelayInput.value, 10),
      deleteBatchDelay: parseInt(deleteDelayInput.value, 10),
      confirmBeforeDelete: true, // Permanent safety requirement
      rules: {
        minQuality: parseInt(ruleMinQuality.value, 10),
        minEngagement: parseInt(ruleMinEngagement.value, 10),
        maxSpam: parseInt(ruleMaxSpam.value, 10),
        maxDuplicate: parseInt(ruleMaxDuplicate.value, 10)
      }
    };

    try {
      await StorageManager.saveSettings(updated);
      saveStatusMsg.className = 'status-msg success';
      saveStatusMsg.textContent = 'Settings saved successfully!';
      setTimeout(() => { saveStatusMsg.textContent = ''; }, 3000);
    } catch (err) {
      saveStatusMsg.className = 'status-msg error';
      saveStatusMsg.textContent = `Failed to save: ${err.message}`;
    }
  });
});
