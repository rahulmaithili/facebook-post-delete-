/**
 * FB AI Post Manager - SaaS Dashboard Main Controller
 */

class DashboardController {
  constructor() {
    this.allPosts = [];
    this.filteredPosts = [];
    this.selectedPostIds = new Set();
    this.isDemoMode = false;
    this.isScanning = false;
    this.isAnalyzing = false;
    this.isDeleting = false;
    this.settings = null;
    this.context = {
      isFacebook: false,
      type: 'UNSUPPORTED',
      name: 'Not Connected',
      id: null
    };

    this.filters = {
      recommendation: 'ALL',
      type: 'ALL',
      maxQuality: 100,
      maxEngagement: 100,
      date: 'ALL',
      confidence: 'ALL',
      searchQuery: '',
      quickFilter: null
    };

    this.aiAnalyzer = null;
  }

  async init() {
    this.bindDomElements();
    this.attachEventListeners();
    await this.loadSettings();

    // Load existing stored posts
    await this.loadStoredPosts();

    // Check Facebook Context
    await this.detectFacebookContext();
    await this.loadRecentGroups();

    try {
      const flags = await chrome.storage.local.get('fb_trigger_quick_scan');
      if (flags && flags.fb_trigger_quick_scan) {
        await chrome.storage.local.remove('fb_trigger_quick_scan');
        this.startScan();
      }
    } catch (err) {}

    if (typeof FBLogger !== 'undefined') {
      FBLogger.info('SYSTEM', 'FB AI Post Manager Dashboard initialized.');
    }
  }

  bindDomElements() {
    // Header
    this.navStatusDot = document.getElementById('navStatusDot');
    this.navStatusText = document.getElementById('navStatusText');
    this.navContextTag = document.getElementById('navContextTag');
    this.btnMinimizeDashboard = document.getElementById('btnMinimizeDashboard');
    this.themeToggleBtn = document.getElementById('themeToggleBtn');
    this.btnOpenSettings = document.getElementById('btnOpenSettings');

    // Facebook Group Target & Selector Trainer
    this.dashGroupInput = document.getElementById('dashGroupInput');
    this.btnDashOpenGroup = document.getElementById('btnDashOpenGroup');
    this.dashRecentChips = document.getElementById('dashRecentChips');
    this.dashPillFeed = document.getElementById('dashPillFeed');
    this.dashPillPosts = document.getElementById('dashPillPosts');
    this.dashPillMenu = document.getElementById('dashPillMenu');
    this.dashPillRemoval = document.getElementById('dashPillRemoval');
    this.btnDashTrain = document.getElementById('btnDashTrain');

    // Action Toolbar
    this.btnInstantScan = document.getElementById('btnInstantScan');
    this.btnScan = document.getElementById('btnScan');
    this.btnStopScan = document.getElementById('btnStopScan');
    this.btnResetScan = document.getElementById('btnResetScan');
    this.btnAnalyzeAi = document.getElementById('btnAnalyzeAi');
    this.btnSelectAll = document.getElementById('btnSelectAll');
    this.btnDeselectAll = document.getElementById('btnDeselectAll');
    this.btnExport = document.getElementById('btnExport');
    this.btnDeleteSelected = document.getElementById('btnDeleteSelected');
    this.deleteCountBadge = document.getElementById('deleteCountBadge');

    // Stat Cards
    this.cardTotalScanned = document.getElementById('cardTotalScanned');
    this.cardAiAnalyzed = document.getElementById('cardAiAnalyzed');
    this.cardAiAnalyzedPercent = document.getElementById('cardAiAnalyzedPercent');
    this.cardSelected = document.getElementById('cardSelected');
    this.cardKeep = document.getElementById('cardKeep');
    this.cardDelete = document.getElementById('cardDelete');
    this.cardReview = document.getElementById('cardReview');
    this.cardDeleted = document.getElementById('cardDeleted');
    this.cardErrors = document.getElementById('cardErrors');

    // Progress Section
    this.progressSection = document.getElementById('progressSection');
    this.progressBarLabel = document.getElementById('progressBarLabel');
    this.progressBarCount = document.getElementById('progressBarCount');
    this.progressBarFill = document.getElementById('progressBarFill');
    this.progressBarSub = document.getElementById('progressBarSub');

    // Filters
    this.recFilterGroup = document.getElementById('recFilterGroup');
    this.typeFilterGroup = document.getElementById('typeFilterGroup');
    this.searchInput = document.getElementById('searchInput');
    this.qualitySlider = document.getElementById('qualitySlider');
    this.qualityVal = document.getElementById('qualityVal');
    this.engagementSlider = document.getElementById('engagementSlider');
    this.engagementVal = document.getElementById('engagementVal');
    this.dateFilterSelect = document.getElementById('dateFilterSelect');
    this.confidenceSelect = document.getElementById('confidenceSelect');
    this.autoSelectToggle = document.getElementById('autoSelectToggle');
    this.filteredCountEl = document.getElementById('filteredCount');

    // Quick Filter Chips
    this.chipDuplicates = document.getElementById('chipDuplicates');
    this.chipLowEngagement = document.getElementById('chipLowEngagement');
    this.chipSpam = document.getElementById('chipSpam');
    this.chipOutdated = document.getElementById('chipOutdated');
    this.chipResetFilters = document.getElementById('chipResetFilters');

    // Table
    this.thSelectAll = document.getElementById('thSelectAll');
    this.postTableBody = document.getElementById('postTableBody');
    this.emptyState = document.getElementById('emptyState');
    this.btnEmptyScan = document.getElementById('btnEmptyScan');

    // Log Drawer
    this.logDrawer = document.getElementById('logDrawer');
    this.logHeader = document.getElementById('logHeader');
    this.logCountBadge = document.getElementById('logCountBadge');
    this.logBody = document.getElementById('logBody');
    this.btnToggleLog = document.getElementById('btnToggleLog');
    this.btnClearLogs = document.getElementById('btnClearLogs');
    this.btnExportLogs = document.getElementById('btnExportLogs');

    // Modals
    this.confirmDeleteModal = document.getElementById('confirmDeleteModal');
    this.modalDeleteCount = document.getElementById('modalDeleteCount');
    this.modalContextName = document.getElementById('modalContextName');
    this.modalAiDeleteCount = document.getElementById('modalAiDeleteCount');
    this.modalManualSelectCount = document.getElementById('modalManualSelectCount');
    this.btnCancelDelete = document.getElementById('btnCancelDelete');
    this.btnConfirmDeleteExecution = document.getElementById('btnConfirmDeleteExecution');

    this.deletionProgressModal = document.getElementById('deletionProgressModal');
    this.delProgressTitle = document.getElementById('delProgressTitle');
    this.delModalProgressFill = document.getElementById('delModalProgressFill');
    this.delStatCurrent = document.getElementById('delStatCurrent');
    this.delStatSuccess = document.getElementById('delStatSuccess');
    this.delStatFailed = document.getElementById('delStatFailed');
    this.delStatSkipped = document.getElementById('delStatSkipped');
    this.delCurrentInfo = document.getElementById('delCurrentInfo');
    this.btnStopDeletion = document.getElementById('btnStopDeletion');
    this.btnDismissDeletion = document.getElementById('btnDismissDeletion');

    this.postDetailModal = document.getElementById('postDetailModal');
    this.detailModalBody = document.getElementById('detailModalBody');
    this.detailAuthor = document.getElementById('detailAuthor');
    this.detailDate = document.getElementById('detailDate');
    this.btnDetailOpenFb = document.getElementById('btnDetailOpenFb');
    this.btnCloseDetail = document.getElementById('btnCloseDetail');
    this.btnDetailClose = document.getElementById('btnDetailClose');

    this.exportModal = document.getElementById('exportModal');
    this.btnCloseExport = document.getElementById('btnCloseExport');
    this.btnExportCsv = document.getElementById('btnExportCsv');
    this.btnExportJson = document.getElementById('btnExportJson');
  }

  attachEventListeners() {
    // Demo Mode toggle
    // Minimize / Return to Facebook button
    if (this.btnMinimizeDashboard) {
      this.btnMinimizeDashboard.addEventListener('click', () => {
        chrome.tabs.query({ url: '*://*.facebook.com/*' }, (fbTabs) => {
          if (fbTabs && fbTabs.length > 0) {
            chrome.tabs.update(fbTabs[0].id, { active: true });
            window.close();
          } else {
            window.close();
          }
        });
      });
    }

    // Theme toggle
    this.themeToggleBtn.addEventListener('click', () => {
      const isDark = document.body.classList.toggle('theme-dark');
      StorageManager.saveSettings({ darkMode: isDark });
    });

    // Settings
    this.btnOpenSettings.addEventListener('click', () => {
      if (chrome.runtime && chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        window.open('../options/options.html');
      }
    });

    // Facebook Group Target & Selector Trainer
    if (this.btnDashOpenGroup) {
      this.btnDashOpenGroup.addEventListener('click', () => this.navigateToGroup());
    }
    if (this.dashGroupInput) {
      this.dashGroupInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.navigateToGroup();
      });
    }
    if (this.btnDashTrain) {
      this.btnDashTrain.addEventListener('click', () => this.trainSelectors());
    }

    // Main Actions
    if (this.btnInstantScan) this.btnInstantScan.addEventListener('click', () => this.instantScan());
    this.btnScan.addEventListener('click', () => this.startScan());
    this.btnStopScan.addEventListener('click', () => this.stopScan());
    if (this.btnResetScan) this.btnResetScan.addEventListener('click', () => this.resetScan());
    this.btnAnalyzeAi.addEventListener('click', () => this.analyzeWithAi());
    this.btnEmptyScan.addEventListener('click', () => this.instantScan());

    // Selection
    this.btnSelectAll.addEventListener('click', () => this.selectAllFiltered());
    this.btnDeselectAll.addEventListener('click', () => this.deselectAll());
    this.thSelectAll.addEventListener('change', (e) => {
      if (e.target.checked) this.selectAllFiltered();
      else this.deselectAll();
    });

    // Bulk Delete
    this.btnDeleteSelected.addEventListener('click', () => this.openConfirmDeleteModal());
    this.btnCancelDelete.addEventListener('click', () => this.closeConfirmDeleteModal());
    this.btnConfirmDeleteExecution.addEventListener('click', () => this.executeBulkDelete());
    this.btnStopDeletion.addEventListener('click', () => this.stopBulkDelete());
    this.btnDismissDeletion.addEventListener('click', () => {
      this.deletionProgressModal.style.display = 'none';
      this.render();
    });

    // Export
    this.btnExport.addEventListener('click', () => {
      this.exportModal.style.display = 'flex';
    });
    this.btnCloseExport.addEventListener('click', () => {
      this.exportModal.style.display = 'none';
    });
    this.btnExportCsv.addEventListener('click', () => {
      Helpers.exportToCsv(`fb_posts_report_${Date.now()}.csv`, this.filteredPosts);
      this.exportModal.style.display = 'none';
    });
    this.btnExportJson.addEventListener('click', () => {
      Helpers.exportToJson(`fb_posts_report_${Date.now()}.json`, {
        exportedAt: new Date().toISOString(),
        context: this.context,
        totalPosts: this.allPosts.length,
        filteredCount: this.filteredPosts.length,
        posts: this.filteredPosts
      });
      this.exportModal.style.display = 'none';
    });

    // Filters: Recommendation
    this.recFilterGroup.querySelectorAll('.pill').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.recFilterGroup.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.filters.recommendation = e.currentTarget.dataset.rec;
        this.applyFilters();
      });
    });

    // Filters: Content Type
    this.typeFilterGroup.querySelectorAll('.pill').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.typeFilterGroup.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.filters.type = e.currentTarget.dataset.type;
        this.applyFilters();
      });
    });

    // Search Input
    this.searchInput.addEventListener('input', (e) => {
      this.filters.searchQuery = e.target.value.toLowerCase().trim();
      this.applyFilters();
    });

    // Sliders
    this.qualitySlider.addEventListener('input', (e) => {
      this.qualityVal.textContent = e.target.value;
      this.filters.maxQuality = parseInt(e.target.value, 10);
      this.applyFilters();
    });

    this.engagementSlider.addEventListener('input', (e) => {
      this.engagementVal.textContent = e.target.value;
      this.filters.maxEngagement = parseInt(e.target.value, 10);
      this.applyFilters();
    });

    // Date & Confidence Dropdowns
    this.dateFilterSelect.addEventListener('change', (e) => {
      this.filters.date = e.target.value;
      this.applyFilters();
    });

    this.confidenceSelect.addEventListener('change', (e) => {
      this.filters.confidence = e.target.value;
      this.applyFilters();
    });

    // AI Auto-Select
    this.autoSelectToggle.addEventListener('change', (e) => {
      if (e.target.checked) {
        this.applyAiAutoSelectRules();
      }
    });

    // Quick Filter Chips
    this.setupQuickFilterChips();

    // Log Drawer Controls
    this.btnToggleLog.addEventListener('click', () => {
      this.logDrawer.classList.toggle('collapsed');
      this.btnToggleLog.textContent = this.logDrawer.classList.contains('collapsed') ? 'Expand' : 'Collapse';
    });
    this.btnClearLogs.addEventListener('click', () => {
      if (typeof FBLogger !== 'undefined') FBLogger.clear();
      this.logBody.innerHTML = '';
      this.logCountBadge.textContent = '0 entries';
    });
    this.btnExportLogs.addEventListener('click', () => {
      if (typeof FBLogger !== 'undefined') {
        Helpers.downloadBlob(`fb_activity_log_${Date.now()}.txt`, 'text/plain;charset=utf-8;', FBLogger.exportAsText());
      }
    });

    // Post Detail Modal
    this.btnCloseDetail.addEventListener('click', () => this.postDetailModal.style.display = 'none');
    this.btnDetailClose.addEventListener('click', () => this.postDetailModal.style.display = 'none');

    // Runtime Message Listener (for live scan updates from Facebook Tab)
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'SCAN_PROGRESS') {
          this.onLiveScanProgress(message.data);
        } else if (message.action === 'SCAN_COMPLETED') {
          this.onLiveScanCompleted(message.data);
        }
      });
    }
  }

  setupQuickFilterChips() {
    const chips = [
      { el: this.chipDuplicates, filter: 'DUPLICATE' },
      { el: this.chipLowEngagement, filter: 'LOW_ENGAGEMENT' },
      { el: this.chipSpam, filter: 'SPAM' },
      { el: this.chipOutdated, filter: 'OUTDATED' }
    ];

    chips.forEach(({ el, filter }) => {
      el.addEventListener('click', () => {
        const isActive = el.classList.contains('active');
        chips.forEach(c => c.el.classList.remove('active'));

        if (!isActive) {
          el.classList.add('active');
          this.filters.quickFilter = filter;
        } else {
          this.filters.quickFilter = null;
        }
        this.applyFilters();
      });
    });

    this.chipResetFilters.addEventListener('click', () => {
      this.resetAllFilters();
    });
  }

  resetAllFilters() {
    this.filters = {
      recommendation: 'ALL',
      type: 'ALL',
      maxQuality: 100,
      maxEngagement: 100,
      date: 'ALL',
      confidence: 'ALL',
      searchQuery: '',
      quickFilter: null
    };

    this.recFilterGroup.querySelectorAll('.pill').forEach(p => p.classList.toggle('active', p.dataset.rec === 'ALL'));
    this.typeFilterGroup.querySelectorAll('.pill').forEach(p => p.classList.toggle('active', p.dataset.type === 'ALL'));
    this.searchInput.value = '';
    this.qualitySlider.value = 100;
    this.qualityVal.textContent = '100';
    this.engagementSlider.value = 100;
    this.engagementVal.textContent = '100';
    this.dateFilterSelect.value = 'ALL';
    this.confidenceSelect.value = 'ALL';

    [this.chipDuplicates, this.chipLowEngagement, this.chipSpam, this.chipOutdated].forEach(c => c.classList.remove('active'));
    this.applyFilters();
  }

  async loadSettings() {
    this.settings = await StorageManager.getSettings();
    if (this.settings.darkMode) {
      document.body.classList.add('theme-dark');
    } else {
      document.body.classList.remove('theme-dark');
    }
    this.aiAnalyzer = new AIAnalyzer(this.settings);
  }

  async loadStoredPosts() {
    this.allPosts = await StorageManager.getPosts();
    this.applyFilters();
    this.updateStats();
  }

  async detectFacebookContext() {
    chrome.runtime.sendMessage({ action: 'GET_ACTIVE_FB_CONTEXT' }, (res) => {
      if (res && res.context && res.context.isFacebook) {
        this.context = res.context;
        this.navStatusDot.className = 'status-dot active';
        this.navStatusText.textContent = 'Connected to Facebook';
        this.navContextTag.textContent = `${this.context.type}: ${this.context.name.substring(0, 24)}`;

        if (this.context.type === 'GROUP' && this.context.id) {
          if (this.dashGroupInput && !this.dashGroupInput.value) {
            this.dashGroupInput.value = this.context.id;
          }
          StorageManager.saveRecentGroup({ id: this.context.id, name: this.context.name, url: this.context.url }).then(() => {
            this.loadRecentGroups();
          });
        }
        this.inspectDomPaths();
      } else {
        if (!this.isDemoMode) {
          this.navStatusDot.className = 'status-dot warning';
          this.navStatusText.textContent = 'Ready (Standalone)';
          this.navContextTag.textContent = 'Open FB or Demo Mode';
        }
      }
    });
  }

  async loadRecentGroups() {
    if (!this.dashRecentChips) return;
    const groups = await StorageManager.getRecentGroups();
    if (!groups || groups.length === 0) {
      this.dashRecentChips.innerHTML = '';
      return;
    }

    this.dashRecentChips.innerHTML = groups.slice(0, 5).map(g => {
      const name = (g.name && g.name !== 'Facebook' && !g.name.includes('Connecting')) ? g.name : (g.id || 'Group');
      const safeName = Helpers.escapeHtml(name);
      const safeId = Helpers.escapeHtml(g.id || g.url || '');
      return `
        <span class="dash-group-chip" data-id="${safeId}" title="Target: ${safeName} (${safeId})">
          <span>${safeName}</span>
          <span class="del-x" data-del="${safeId}">✕</span>
        </span>
      `;
    }).join('');

    this.dashRecentChips.querySelectorAll('.dash-group-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        if (e.target.classList.contains('del-x')) {
          e.stopPropagation();
          StorageManager.removeRecentGroup(e.target.dataset.del).then(() => this.loadRecentGroups());
          return;
        }
        const id = chip.dataset.id;
        if (this.dashGroupInput) this.dashGroupInput.value = id;
        this.navigateToGroup(id);
      });
    });
  }

  async navigateToGroup(idOrUrl = null) {
    const target = (idOrUrl || (this.dashGroupInput ? this.dashGroupInput.value : '')).trim();
    if (!target) {
      alert('Please enter a Facebook Group ID or Link (e.g. 1840651402763977)');
      return;
    }

    if (this.btnDashOpenGroup) {
      this.btnDashOpenGroup.disabled = true;
      this.btnDashOpenGroup.textContent = 'Opening...';
    }

    chrome.runtime.sendMessage({
      action: 'NAVIGATE_TO_GROUP',
      groupIdOrUrl: target
    }, async (res) => {
      if (this.btnDashOpenGroup) {
        this.btnDashOpenGroup.disabled = false;
        this.btnDashOpenGroup.textContent = '🚀 Open Group';
      }

      if (res && res.success) {
        await this.loadRecentGroups();
        setTimeout(async () => {
          await this.detectFacebookContext();
        }, 1500);
      } else {
        alert(res ? res.error : 'Failed to navigate to group');
      }
    });
  }

  async inspectDomPaths() {
    const groupId = this.context && this.context.id ? this.context.id : null;
    const trained = await StorageManager.getTrainedSelectors(groupId);
    if (trained && this.dashPillRemoval) {
      this.dashPillRemoval.className = 'dash-pill success';
      this.dashPillRemoval.textContent = `Action: ${trained.deleteMenuItemText || 'Trained'}`;
    }

    chrome.runtime.sendMessage({ action: 'INSPECT_DOM_PATHS' }, (res) => {
      if (!res || !res.report) return;
      const r = res.report;
      if (this.dashPillFeed) {
        this.dashPillFeed.className = r.feed.found ? 'dash-pill success' : 'dash-pill warning';
        this.dashPillFeed.textContent = r.feed.found ? 'Feed: OK' : 'Feed: Standard';
      }
      if (this.dashPillPosts) {
        this.dashPillPosts.className = r.posts.found ? 'dash-pill success' : 'dash-pill';
        this.dashPillPosts.textContent = `Posts: ${r.posts.count}`;
      }
      if (this.dashPillMenu) {
        this.dashPillMenu.className = r.actionTrigger.found ? 'dash-pill success' : 'dash-pill warning';
        this.dashPillMenu.textContent = r.actionTrigger.found ? 'Menu: OK' : 'Menu: Check';
      }
    });
  }

  async trainSelectors() {
    if (this.btnDashTrain) {
      this.btnDashTrain.disabled = true;
      this.btnDashTrain.textContent = '⏳ Training...';
    }

    chrome.runtime.sendMessage({ action: 'TRAIN_SELECTORS' }, async (res) => {
      if (this.btnDashTrain) {
        this.btnDashTrain.disabled = false;
        this.btnDashTrain.textContent = '⚡ Train Selectors';
      }

      if (res && res.success && res.training) {
        const t = res.training;
        const groupId = this.context && this.context.id ? this.context.id : t.groupId;
        await StorageManager.saveTrainedSelectors(groupId, t);

        if (this.dashPillRemoval) {
          this.dashPillRemoval.className = 'dash-pill success';
          this.dashPillRemoval.textContent = `Action: ${t.deleteMenuItemText || 'Trained'}`;
        }
        await this.inspectDomPaths();
        alert(`✅ ${t.message || 'DOM Selectors trained successfully! Ready for bulk removal.'}`);
      } else {
        alert(`⚠️ ${res ? res.error || (res.training && res.training.message) : 'Could not train selectors. Make sure Facebook Group feed is loaded.'}`);
      }
    });
  }

  updateDemoUi() {
    if (this.isDemoMode) {
      this.demoBanner.style.display = 'flex';
      this.navStatusDot.className = 'status-dot active';
      this.navStatusText.textContent = 'Demo Sandbox Active';
      this.navContextTag.textContent = 'Group: Dev Community (100 Posts)';
      this.context = {
        isFacebook: true,
        type: 'GROUP',
        name: 'Dev Community (Demo Sandbox)',
        id: 'demo_dev_community'
      };
    } else {
      this.demoBanner.style.display = 'none';
      this.detectFacebookContext();
    }
  }

  // ==========================================
  // SCANNING ENGINE
  // ==========================================
  async startScan() {
    this.isScanning = true;
    this.btnScan.disabled = true;
    this.btnStopScan.disabled = false;
    this.showProgressBar('Scanning Facebook Posts...', 'Initial scan starting...');

    if (this.isDemoMode) {
      // Demo Mode Scanning Simulation (100 Posts)
      if (typeof FBLogger !== 'undefined') FBLogger.info('SCAN', 'Starting simulation scan with 100 posts...');
      
      const rawDemoPosts = DemoData.generate100DemoPosts();
      // Run duplicate clustering before adding
      const clusteredPosts = SimilarityEngine.clusterDuplicates(rawDemoPosts);

      const total = clusteredPosts.length;
      let loaded = 0;
      this.allPosts = [];

      const interval = setInterval(async () => {
        if (!this.isScanning) {
          clearInterval(interval);
          return;
        }

        const step = 15;
        loaded = Math.min(total, loaded + step);
        this.allPosts = clusteredPosts.slice(0, loaded);

        this.updateProgressBar(loaded, total, `Scanned ${loaded} of ${total} demo posts...`);
        this.applyFilters();
        this.updateStats();

        if (loaded >= total) {
          clearInterval(interval);
          this.isScanning = false;
          this.btnScan.disabled = false;
          this.btnStopScan.disabled = true;
          this.hideProgressBar();
          await StorageManager.savePosts(this.allPosts);
          if (typeof FBLogger !== 'undefined') FBLogger.success('SCAN', `Scan completed: ${total} posts loaded into dashboard.`);
        }
      }, 400);

    } else {
      // Real Facebook Feed Scanning
      if (typeof FBLogger !== 'undefined') FBLogger.info('SCAN', 'Initiating live scan on active Facebook tab...');
      chrome.runtime.sendMessage({
        action: 'START_SCAN',
        options: {
          scanLimit: this.settings.scanLimit,
          scanDelay: this.settings.scanDelay
        }
      }, (res) => {
        if (!res || !res.success) {
          this.isScanning = false;
          this.btnScan.disabled = false;
          this.btnStopScan.disabled = true;
          this.hideProgressBar();
          alert('Could not start live Facebook scan. Ensure an active Facebook Group or Page tab is open.');
          if (typeof FBLogger !== 'undefined') FBLogger.error('SCAN', 'Failed to connect to Facebook tab scanner.');
        }
      });
    }
  }

  /**
   * Direct instant scan: grabs visible DOM posts in <100ms without scrolling wait
   */
  async instantScan() {
    if (this.isScanning) return;
    if (this.btnInstantScan) this.btnInstantScan.disabled = true;
    this.showProgressBar('Direct Instant Scanning...', 'Extracting loaded DOM posts...');

    chrome.runtime.sendMessage({ action: 'INSTANT_SCAN' }, async (res) => {
      if (this.btnInstantScan) this.btnInstantScan.disabled = false;
      this.hideProgressBar();

      if (res && res.success && res.posts) {
        const currentMap = new Map(this.allPosts.map(p => [p.id, p]));
        res.posts.forEach(p => currentMap.set(p.id, p));
        this.allPosts = Array.from(currentMap.values());
        await StorageManager.savePosts(this.allPosts);
        this.applyFilters();
        this.updateStats();
        if (typeof FBLogger !== 'undefined') FBLogger.success('SCAN', `Direct scan extracted ${res.posts.length} visible posts immediately.`);
      } else {
        alert('Could not extract posts directly. Make sure your Facebook Group or Page tab is open and visible.');
        if (typeof FBLogger !== 'undefined') FBLogger.error('SCAN', 'Instant scan returned no posts.');
      }
    });
  }

  /**
   * Reset Scan: clears all posts from state, UI and storage
   */
  async resetScan() {
    if (this.allPosts.length === 0) {
      alert('No scanned posts to reset.');
      return;
    }

    if (!confirm('Are you sure you want to reset and clear all scanned posts?')) {
      return;
    }

    if (this.isScanning) {
      this.stopScan();
      chrome.runtime.sendMessage({ action: 'RESET_SCAN' });
    }

    this.allPosts = [];
    this.filteredPosts = [];
    this.selectedPostIds.clear();
    await StorageManager.clearPosts();
    this.applyFilters();
    this.updateStats();
    if (typeof FBLogger !== 'undefined') FBLogger.info('STORAGE', 'All scanned posts reset and cleared.');
  }

  stopScan() {
    this.isScanning = false;
    this.btnScan.disabled = false;
    if (this.btnInstantScan) this.btnInstantScan.disabled = false;
    this.btnStopScan.disabled = true;
    this.hideProgressBar();

    if (!this.isDemoMode) {
      chrome.runtime.sendMessage({ action: 'STOP_SCAN' });
    }
    if (typeof FBLogger !== 'undefined') FBLogger.warn('SCAN', 'Scan stopped by user.');
  }

  onLiveScanProgress(data) {
    this.updateProgressBar(data.count, data.limit, `Scanned ${data.count} / ${data.limit} posts...`);
    if (data.latestPosts && data.latestPosts.length) {
      const currentMap = new Map(this.allPosts.map(p => [p.id, p]));
      data.latestPosts.forEach(p => currentMap.set(p.id, p));
      this.allPosts = Array.from(currentMap.values());
      this.applyFilters();
      this.updateStats();
    }
  }

  async onLiveScanCompleted(data) {
    this.isScanning = false;
    this.btnScan.disabled = false;
    this.btnStopScan.disabled = true;
    this.hideProgressBar();

    if (data.posts && data.posts.length) {
      // Run duplicate clustering
      this.allPosts = SimilarityEngine.clusterDuplicates(data.posts);
      await StorageManager.savePosts(this.allPosts);
      this.applyFilters();
      this.updateStats();
      if (typeof FBLogger !== 'undefined') {
        FBLogger.success('SCAN', `Live scan completed: ${this.allPosts.length} posts gathered. Reason: ${data.reason}`);
      }
    }
  }

  // ==========================================
  // AI CONTENT ANALYSIS
  // ==========================================
  async analyzeWithAi() {
    if (this.isAnalyzing || !this.allPosts.length) return;
    this.isAnalyzing = true;
    this.btnAnalyzeAi.disabled = true;

    if (typeof FBLogger !== 'undefined') {
      FBLogger.info('AI', `Starting AI analysis on ${this.allPosts.length} posts...`);
    }

    this.showProgressBar('AI Analysis in Progress', 'Preparing batches...');

    try {
      this.allPosts = await this.aiAnalyzer.analyzePosts(this.allPosts, (curr, total, msg) => {
        this.updateProgressBar(curr, total, msg);
        this.applyFilters();
        this.updateStats();
      });

      await StorageManager.savePosts(this.allPosts);

      // Update extension badge with number of DELETE recommendations
      const deleteCount = this.allPosts.filter(p => p.recommendation === 'DELETE').length;
      chrome.runtime.sendMessage({ action: 'UPDATE_BADGE', count: deleteCount });

      if (typeof FBLogger !== 'undefined') {
        FBLogger.success('AI', `AI Analysis complete: ${deleteCount} DELETE recommendations flagged.`);
      }
    } catch (err) {
      if (typeof FBLogger !== 'undefined') {
        FBLogger.error('AI', `Analysis encountered error: ${err.message}`);
      }
    } finally {
      this.isAnalyzing = false;
      this.btnAnalyzeAi.disabled = false;
      this.hideProgressBar();
      this.applyFilters();
      this.updateStats();
    }
  }

  // ==========================================
  // FILTERING & RULES
  // ==========================================
  applyFilters() {
    this.filteredPosts = this.allPosts.filter(post => {
      // 1. Recommendation
      if (this.filters.recommendation !== 'ALL') {
        if (post.recommendation !== this.filters.recommendation) return false;
      }

      // 2. Type
      if (this.filters.type !== 'ALL') {
        if (post.type !== this.filters.type) return false;
      }

      // 3. Scores
      if (post.qualityScore !== undefined && post.qualityScore > this.filters.maxQuality) {
        return false;
      }
      if (post.engagementScore !== undefined && post.engagementScore > this.filters.maxEngagement) {
        return false;
      }

      // 4. Date
      if (this.filters.date !== 'ALL') {
        const postTime = new Date(post.date).getTime();
        const now = Date.now();
        const dayMs = 86400000;
        if (this.filters.date === '7D' && now - postTime > 7 * dayMs) return false;
        if (this.filters.date === '30D' && now - postTime > 30 * dayMs) return false;
        if (this.filters.date === '90D' && now - postTime > 90 * dayMs) return false;
        if (this.filters.date === '1Y' && now - postTime > 365 * dayMs) return false;
      }

      // 5. Confidence
      if (this.filters.confidence !== 'ALL' && post.confidence) {
        if (this.filters.confidence === 'HIGH' && post.confidence < 0.85) return false;
        if (this.filters.confidence === 'MED' && (post.confidence < 0.70 || post.confidence >= 0.85)) return false;
        if (this.filters.confidence === 'LOW' && post.confidence >= 0.70) return false;
      }

      // 6. Search Query
      if (this.filters.searchQuery) {
        const q = this.filters.searchQuery;
        const text = (post.text || '').toLowerCase();
        const author = (post.author || '').toLowerCase();
        const id = (post.id || '').toLowerCase();
        if (!text.includes(q) && !author.includes(q) && !id.includes(q)) return false;
      }

      // 7. Quick Filter Chips
      if (this.filters.quickFilter) {
        if (this.filters.quickFilter === 'DUPLICATE' && (!post.isDuplicate && post.duplicateScore < 75)) return false;
        if (this.filters.quickFilter === 'LOW_ENGAGEMENT' && ((post.reactions || 0) > 3 || (post.comments || 0) > 1)) return false;
        if (this.filters.quickFilter === 'SPAM' && (post.spamScore || 0) < 70) return false;
        if (this.filters.quickFilter === 'OUTDATED') {
          const postAgeDays = (Date.now() - new Date(post.date).getTime()) / 86400000;
          if (postAgeDays < 180) return false;
        }
      }

      return true;
    });

    this.filteredCountEl.textContent = this.filteredPosts.length;
    this.render();
  }

  applyAiAutoSelectRules() {
    const rules = this.settings.rules || {
      minQuality: 40,
      minEngagement: 15,
      maxSpam: 75,
      maxDuplicate: 85
    };

    let newlySelectedCount = 0;
    this.allPosts.forEach(post => {
      // AI Recommendation Rule evaluation
      const matchesRule = (
        post.recommendation === 'DELETE' ||
        (post.qualityScore !== undefined && post.qualityScore < rules.minQuality) ||
        (post.engagementScore !== undefined && post.engagementScore < rules.minEngagement) ||
        (post.spamScore !== undefined && post.spamScore > rules.maxSpam) ||
        (post.duplicateScore !== undefined && post.duplicateScore > rules.maxDuplicate)
      );

      if (matchesRule) {
        this.selectedPostIds.add(post.id);
        post.isSelected = true;
        newlySelectedCount++;
      }
    });

    this.updateStats();
    this.render();

    if (typeof FBLogger !== 'undefined') {
      FBLogger.info('FILTER', `AI Auto-Select Rule executed: ${newlySelectedCount} matching posts selected.`);
    }
  }

  // ==========================================
  // SELECTION
  // ==========================================
  selectAllFiltered() {
    this.filteredPosts.forEach(p => {
      this.selectedPostIds.add(p.id);
      p.isSelected = true;
    });
    this.updateStats();
    this.render();
  }

  deselectAll() {
    this.selectedPostIds.clear();
    this.allPosts.forEach(p => p.isSelected = false);
    this.thSelectAll.checked = false;
    this.updateStats();
    this.render();
  }

  togglePostSelection(postId) {
    const post = this.allPosts.find(p => p.id === postId);
    if (!post) return;

    if (this.selectedPostIds.has(postId)) {
      this.selectedPostIds.delete(postId);
      post.isSelected = false;
    } else {
      this.selectedPostIds.add(postId);
      post.isSelected = true;
    }

    this.updateStats();
    this.render();
  }

  // ==========================================
  // SAFE BULK DELETION
  // ==========================================
  openConfirmDeleteModal() {
    const count = this.selectedPostIds.size;
    if (count === 0) return;

    const selectedPosts = this.allPosts.filter(p => this.selectedPostIds.has(p.id));
    const aiDeleteCount = selectedPosts.filter(p => p.recommendation === 'DELETE').length;
    const manualCount = count - aiDeleteCount;

    this.modalDeleteCount.textContent = count;
    this.modalContextName.textContent = this.context.name || 'Facebook';
    this.modalAiDeleteCount.textContent = aiDeleteCount;
    this.modalManualSelectCount.textContent = manualCount;

    this.confirmDeleteModal.style.display = 'flex';
  }

  closeConfirmDeleteModal() {
    this.confirmDeleteModal.style.display = 'none';
  }

  async executeBulkDelete() {
    this.closeConfirmDeleteModal();
    const postsToDelete = this.allPosts.filter(p => this.selectedPostIds.has(p.id));
    if (!postsToDelete.length) return;

    this.isDeleting = true;
    this.deletionProgressModal.style.display = 'flex';
    this.btnDismissDeletion.style.display = 'none';
    this.btnStopDeletion.style.display = 'inline-flex';
    this.delProgressTitle.textContent = `Deleting ${postsToDelete.length} Posts...`;

    const total = postsToDelete.length;
    let successful = 0;
    let failed = 0;
    let skipped = 0;

    if (typeof FBLogger !== 'undefined') {
      FBLogger.warn('ACTION', `Starting verified sequential bulk deletion of ${total} posts...`);
    }

    if (this.isDemoMode) {
      // Demo Safe Simulated Deletion
      for (let i = 0; i < total; i++) {
        if (!this.isDeleting) {
          if (typeof FBLogger !== 'undefined') FBLogger.warn('ACTION', 'Simulated deletion stopped by user.');
          break;
        }

        const post = postsToDelete[i];
        this.delCurrentInfo.textContent = `Deleting: "${(post.text || '').substring(0, 40)}..."`;
        this.delStatCurrent.textContent = `${i + 1} / ${total}`;
        this.delModalProgressFill.style.width = `${Math.round(((i + 1) / total) * 100)}%`;

        await new Promise(r => setTimeout(r, 600)); // simulation delay

        // Simulate 95% success rate
        if (Math.random() < 0.95) {
          successful++;
          post.status = 'DELETED';
          this.selectedPostIds.delete(post.id);
        } else {
          failed++;
          post.status = 'FAILED';
        }

        this.delStatSuccess.textContent = successful;
        this.delStatFailed.textContent = failed;
        this.delStatSkipped.textContent = skipped;
      }

      this.concludeBulkDelete(total, successful, failed, skipped);
    } else {
      // Live Facebook Deletion via Content Script
      chrome.runtime.sendMessage({
        action: 'BULK_DELETE',
        posts: postsToDelete,
        options: {
          deleteBatchDelay: this.settings.deleteBatchDelay
        }
      }, async (res) => {
        if (res && res.success && res.results) {
          const r = res.results;
          const successIds = new Set((r.details || []).filter(d => d.status === 'SUCCESS').map(d => d.id));
          if (successIds.size > 0) {
            this.allPosts = this.allPosts.filter(p => !successIds.has(p.id));
            successIds.forEach(id => this.selectedPostIds.delete(id));
            await StorageManager.savePosts(this.allPosts);
            this.applyFilters();
            this.updateStats();
          }
          this.concludeBulkDelete(total, r.successful, r.failed, r.skipped);
        } else {
          this.concludeBulkDelete(total, 0, total, 0, res ? res.error : 'Unknown error');
        }
      });
    }
  }

  stopBulkDelete() {
    this.isDeleting = false;
    if (!this.isDemoMode) {
      chrome.runtime.sendMessage({ action: 'STOP_DELETE' });
    }
  }

  async concludeBulkDelete(total, successful, failed, skipped, errorMsg = null) {
    this.isDeleting = false;
    this.delProgressTitle.textContent = 'Deletion Process Complete';
    this.btnStopDeletion.style.display = 'none';
    this.btnDismissDeletion.style.display = 'inline-flex';
    this.delCurrentInfo.textContent = errorMsg
      ? `Ended with error: ${errorMsg}`
      : `Complete: ${successful} deleted, ${failed} failed, ${skipped} skipped.`;

    // Remove deleted posts from active dashboard list
    this.allPosts = this.allPosts.filter(p => p.status !== 'DELETED');
    await StorageManager.savePosts(this.allPosts);

    if (typeof FBLogger !== 'undefined') {
      FBLogger.success('ACTION', `Deletion completed: ${successful} deleted, ${failed} failed, ${skipped} skipped.`);
    }

    this.applyFilters();
    this.updateStats();
  }

  // ==========================================
  // UI RENDERING & TABLE
  // ==========================================
  render() {
    if (this.allPosts.length === 0) {
      this.emptyState.style.display = 'flex';
      this.postTableBody.innerHTML = '';
      return;
    }

    this.emptyState.style.display = 'none';

    // Check if all filtered are selected
    const allFilteredSelected = this.filteredPosts.length > 0 &&
      this.filteredPosts.every(p => this.selectedPostIds.has(p.id));
    this.thSelectAll.checked = allFilteredSelected;

    const htmlRows = this.filteredPosts.map(post => {
      const isSelected = this.selectedPostIds.has(post.id);
      const rowClass = isSelected ? 'row-selected' : '';

      // Preview Thumbnail
      let previewHtml = '';
      if (post.imageUrl) {
        previewHtml = `<img src="${Helpers.escapeHtml(post.imageUrl)}" class="thumb-preview" alt="Thumbnail" onerror="this.style.display='none'">`;
      } else {
        previewHtml = `<div class="thumb-placeholder">${this.getTypeIcon(post.type)}</div>`;
      }

      // Format Date
      const dateInfo = Helpers.formatDate(post.date);

      // AI Recommendation Badge
      const rec = post.recommendation || 'PENDING';
      const recClass = rec === 'KEEP' ? 'rec-keep' : (rec === 'DELETE' ? 'rec-delete' : (rec === 'REVIEW' ? 'rec-review' : 'rec-pending'));

      // Scores
      const qScore = post.qualityScore ?? '-';
      const eScore = post.engagementScore ?? '-';
      const sScore = post.spamScore ?? '-';
      const dScore = post.duplicateScore ?? '-';

      const confText = post.confidence ? `${Math.round(post.confidence * 100)}%` : '-';

      return `
        <tr class="${rowClass}" data-id="${post.id}">
          <td class="col-check">
            <input type="checkbox" class="post-checkbox" data-id="${post.id}" ${isSelected ? 'checked' : ''}>
          </td>
          <td class="col-preview">${previewHtml}</td>
          <td class="col-type"><span class="type-badge">${post.type || 'TEXT'}</span></td>
          <td class="col-author">
            <span class="post-author-name">${Helpers.escapeHtml(post.author || 'User')}</span>
          </td>
          <td class="col-date">
            <span title="${dateInfo.iso}">${dateInfo.relative}</span>
            <span class="post-date-sub">${dateInfo.formatted}</span>
          </td>
          <td class="col-content">
            <div class="post-snippet" data-id="${post.id}" title="Click to view details">
              ${Helpers.escapeHtml(post.text || (post.imageUrl ? '📷 Photo / Media Post' : '(No text caption)'))}
            </div>
            ${post.isDuplicate ? `<span class="duplicate-pill">${post.duplicateHint || 'Duplicate'}</span>` : ''}
          </td>
          <td class="col-engagement">
            <div class="eng-metrics">
              <span class="eng-item" title="Likes / Reactions">👍 ${Helpers.formatCount(post.reactions)}</span>
              <span class="eng-item" title="Comments">💬 ${Helpers.formatCount(post.comments)}</span>
              <span class="eng-item" title="Shares">🔄 ${Helpers.formatCount(post.shares)}</span>
              <span class="eng-item" title="Views / Plays">👁️ ${Helpers.formatCount(post.views || 0)}</span>
            </div>
          </td>
          <td class="col-scores">
            <div class="scores-badge-row">
              <span class="score-tag ${this.getScoreClass(qScore, 'high')}" title="Quality">${qScore}</span>
              <span class="score-tag ${this.getScoreClass(eScore, 'high')}" title="Engagement">${eScore}</span>
              <span class="score-tag ${this.getScoreClass(sScore, 'low')}" title="Spam">${sScore}</span>
              <span class="score-tag ${this.getScoreClass(dScore, 'low')}" title="Duplicate">${dScore}</span>
            </div>
          </td>
          <td class="col-rec">
            <span class="rec-badge ${recClass}">${rec}</span>
          </td>
          <td class="col-conf">${confText}</td>
          <td class="col-action">
            <div class="table-actions">
              <a href="${Helpers.escapeHtml(post.url || '#')}" target="_blank" class="action-icon-link" title="Open on Facebook">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                  <polyline points="15 3 21 3 21 9"></polyline>
                  <line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>
              </a>
              <button class="action-icon-link btn-inspect-post" data-id="${post.id}" title="Inspect Details" style="background:none;border:none;cursor:pointer;">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="16" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    this.postTableBody.innerHTML = htmlRows;

    // Attach row checkbox handlers
    this.postTableBody.querySelectorAll('.post-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const id = e.target.dataset.id;
        this.togglePostSelection(id);
      });
    });

    // Attach row click to inspect
    this.postTableBody.querySelectorAll('.post-snippet, .btn-inspect-post').forEach(el => {
      el.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        this.openPostDetailModal(id);
      });
    });
  }

  updateStats() {
    const total = this.allPosts.length;
    const analyzed = this.allPosts.filter(p => p.recommendation && p.recommendation !== 'PENDING').length;
    const selected = this.selectedPostIds.size;
    const keep = this.allPosts.filter(p => p.recommendation === 'KEEP').length;
    const del = this.allPosts.filter(p => p.recommendation === 'DELETE').length;
    const rev = this.allPosts.filter(p => p.recommendation === 'REVIEW').length;
    const deleted = this.allPosts.filter(p => p.status === 'DELETED').length;
    const errors = this.allPosts.filter(p => p.status === 'FAILED' || p.status === 'ANALYSIS_FAILED').length;

    this.cardTotalScanned.textContent = total;
    this.cardAiAnalyzed.textContent = analyzed;
    this.cardAiAnalyzedPercent.textContent = total > 0 ? `${Math.round((analyzed / total) * 100)}% coverage` : '0% coverage';
    this.cardSelected.textContent = selected;
    this.cardKeep.textContent = keep;
    this.cardDelete.textContent = del;
    this.cardReview.textContent = rev;
    this.cardDeleted.textContent = deleted;
    this.cardErrors.textContent = errors;

    this.deleteCountBadge.textContent = selected;
    this.btnDeleteSelected.disabled = selected === 0;
  }

  showProgressBar(label, sub) {
    this.progressSection.style.display = 'flex';
    this.progressBarLabel.textContent = label;
    this.progressBarSub.textContent = sub;
  }

  updateProgressBar(current, total, sub) {
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    this.progressBarCount.textContent = `${current} / ${total}`;
    this.progressBarFill.style.width = `${percent}%`;
    if (sub) this.progressBarSub.textContent = sub;
  }

  hideProgressBar() {
    this.progressSection.style.display = 'none';
  }

  getTypeIcon(type) {
    if (type === 'IMAGE') return '🖼️';
    if (type === 'VIDEO') return '🎬';
    if (type === 'LINK') return '🔗';
    if (type === 'REEL') return '📱';
    return '📝';
  }

  getScoreClass(score, favorableDirection = 'high') {
    if (score === '-' || score === undefined) return '';
    const n = Number(score);
    if (favorableDirection === 'high') {
      return n >= 70 ? 'score-high' : (n >= 40 ? 'score-mid' : 'score-low');
    } else {
      // For Spam and Duplicate: Lower is better
      return n >= 70 ? 'score-low' : (n >= 40 ? 'score-mid' : 'score-high');
    }
  }

  openPostDetailModal(postId) {
    const post = this.allPosts.find(p => p.id === postId);
    if (!post) return;

    this.detailAuthor.textContent = `${post.author || 'User'} • ${post.type || 'TEXT'}`;
    this.detailDate.textContent = post.date || '';
    this.btnDetailOpenFb.href = post.url || '#';

    let mediaHtml = '';
    if (post.imageUrl) {
      mediaHtml = `
        <div style="margin: 12px 0;">
          <img src="${Helpers.escapeHtml(post.imageUrl)}" style="max-width: 100%; max-height: 280px; border-radius: 8px;" alt="Post Media">
        </div>
      `;
    }

    this.detailModalBody.innerHTML = `
      ${mediaHtml}
      <div style="font-size: 14px; line-height: 1.5; margin-bottom: 16px; background: var(--bg-input); padding: 14px; border-radius: 8px;">
        ${Helpers.escapeHtml(post.text || '(No text body)')}
      </div>

      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 14px;">
        <div class="del-stat">
          <span class="del-stat-num ${post.recommendation === 'KEEP' ? 'text-success' : (post.recommendation === 'DELETE' ? 'text-danger' : 'text-warning')}">
            ${post.recommendation || 'PENDING'}
          </span>
          <span class="del-stat-label">Recommendation (${Math.round((post.confidence || 0) * 100)}% Conf)</span>
        </div>
        <div class="del-stat">
          <span class="del-stat-num">${post.overallScore ?? '-'}</span>
          <span class="del-stat-label">Overall Health Score</span>
        </div>
      </div>

      <div style="background: var(--bg-input); padding: 12px; border-radius: 8px; font-size: 12px; margin-bottom: 12px;">
        <strong>AI Reasoning:</strong>
        <p style="margin-top: 4px; color: var(--text-secondary);">${Helpers.escapeHtml(post.reason || 'Not analyzed yet.')}</p>
      </div>

      ${post.duplicateHint ? `
        <div style="background: rgba(139, 92, 246, 0.15); border: 1px solid rgba(139, 92, 246, 0.3); padding: 10px; border-radius: 8px; font-size: 12px; color: #c084fc;">
          <strong>Duplicate Analysis:</strong> ${Helpers.escapeHtml(post.duplicateHint)}
        </div>
      ` : ''}
    `;

    this.postDetailModal.style.display = 'flex';
  }

  // ==========================================
  // ACTIVITY LOGGING
  // ==========================================
  renderExistingLogs() {
    if (typeof FBLogger === 'undefined') return;
    const logs = FBLogger.getLogs();
    this.logBody.innerHTML = '';
    logs.slice(0, 100).reverse().forEach(l => this.appendLogLine(l));
    this.logCountBadge.textContent = `${logs.length} entries`;
  }

  onNewLogEntry(entry) {
    if (entry.type === 'CLEAR') {
      this.logBody.innerHTML = '';
      this.logCountBadge.textContent = '0 entries';
      return;
    }
    this.appendLogLine(entry);
    const count = parseInt(this.logCountBadge.textContent, 10) || 0;
    this.logCountBadge.textContent = `${count + 1} entries`;
  }

  appendLogLine(entry) {
    const line = document.createElement('div');
    line.className = `log-line log-${entry.level}`;
    line.textContent = `[${entry.displayTime}] [${entry.category}] ${entry.message}`;
    this.logBody.appendChild(line);
    this.logBody.scrollTop = this.logBody.scrollHeight;
  }
}

// Instantiate dashboard controller
document.addEventListener('DOMContentLoaded', () => {
  window.dashboardApp = new DashboardController();
  window.dashboardApp.init();
});
