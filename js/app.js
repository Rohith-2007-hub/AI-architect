/**
 * HomeBrief — Main Application Controller
 * Manages UI state, 3-step guided flow, shared space metrics, cost math,
 * practical planning notes, viewer zoom/fullscreen controls, and SVG/PNG/PDF exports.
 */
window.HomeBrief = window.HomeBrief || {};

document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  const SQFT_PER_CENT = 435.6;

  const BUILDING_TYPE_HINTS = {
    independent: 'Single-family home with front porch, living/dining, kitchen, and private rear bedrooms.',
    duplex: 'Two-level home featuring an internal staircase connected directly to the living and dining core.',
    villa: 'Spacious home with generous setbacks, verandah sit-out, foyer, pantry, and walk-in wardrobe.',
    commercial_residential: 'Ground-floor shop/showroom frontage with separate side entry to upper residential floors.',
    rental_apartments: 'Multi-unit floor layout with a central common staircase serving independent front and rear units.'
  };

  const BUILDING_TYPE_LABELS = {
    independent: 'Independent House',
    duplex: 'Duplex House',
    villa: 'Luxury Villa',
    commercial_residential: 'Commercial + Residential',
    rental_apartments: 'Rental Apartments (Multi-Unit)'
  };

  window.HomeBrief.App = (function () {
    let currentStep = 1;
    let highestUnlockedStep = 1;
    let formData = {};
    let plotData = null;
    let layoutData = null;
    let currentOption = 0;
    let currentFloor = 0;
    let zoomPct = 100;

    function getActiveOption(groupId) {
      const group = document.getElementById(groupId);
      if (!group) return '';
      const active = group.querySelector('.option-btn.active');
      return active ? active.dataset.value : '';
    }

    function collectFormData() {
      const landArea = parseFloat(document.getElementById('land-area').value) || 0;
      const landUnit = document.getElementById('land-unit').value;
      let landAreaSqFt = landArea;
      if (landUnit === 'cents') landAreaSqFt = landArea * SQFT_PER_CENT;
      else if (landUnit === 'sqyards') landAreaSqFt = landArea * 9;

      const roadFacing = getActiveOption('road-facing-group') || 'east';
      const cornerPlot = document.getElementById('corner-plot').checked;
      const buildingType = document.getElementById('building-type').value || 'independent';
      const floors = getActiveOption('floors-group') || 'G+1';
      const config = getActiveOption('config-group') || '3BHK';
      const parking = getActiveOption('parking-group') || '1car';
      const budgetTier = getActiveOption('budget-group') || 'standard';

      const budgetRates = { basic: 1800, standard: 2100, premium: 2600 };
      const budgetRate = budgetRates[budgetTier] || 2100;

      return {
        landArea,
        landUnit,
        landAreaSqFt,
        roadFacing,
        cornerPlot,
        buildingType,
        floors,
        config,
        parking,
        budgetTier,
        budgetRate
      };
    }

    function updateAreaConversion() {
      const areaInput = document.getElementById('land-area');
      const unitSelect = document.getElementById('land-unit');
      const convEl = document.getElementById('area-conversion');
      const errEl = document.getElementById('land-area-error');
      if (!areaInput || !unitSelect || !convEl) return;

      const val = parseFloat(areaInput.value) || 0;
      const unit = unitSelect.value;
      let sqft = val;
      if (unit === 'cents') sqft = val * SQFT_PER_CENT;
      else if (unit === 'sqyards') sqft = val * 9;

      let text = `= ${Math.round(sqft).toLocaleString('en-IN')} Sq.Ft`;
      if (unit === 'cents') text += ' (1 Cent = 435.6 Sq.Ft)';
      else text += ` (${(sqft / SQFT_PER_CENT).toFixed(2)} Cents)`;
      convEl.textContent = text;

      if (sqft >= 600) {
        areaInput.classList.remove('error-highlight');
        if (errEl) errEl.classList.add('hidden');
      }
    }

    function validateStep1() {
      const data = collectFormData();
      const areaInput = document.getElementById('land-area');
      const errEl = document.getElementById('land-area-error');

      if (!data.landArea || data.landAreaSqFt < 600) {
        if (areaInput) {
          areaInput.classList.add('error-highlight');
          areaInput.focus();
        }
        if (errEl) errEl.classList.remove('hidden');
        return false;
      }

      if (areaInput) areaInput.classList.remove('error-highlight');
      if (errEl) errEl.classList.add('hidden');
      return true;
    }

    function goToStep(targetStep) {
      if (targetStep > 1 && !validateStep1()) return;
      if (targetStep === 3) {
        const pd = window.HomeBrief.PlotEditor.getPlotData();
        const diffPct = Math.abs(pd.area - pd.targetArea) / pd.targetArea * 100;
        if (diffPct > 2.05) return;
      }

      document.querySelectorAll('.step-container').forEach(el => el.classList.add('hidden'));
      const targetEl = document.getElementById('step-' + targetStep);
      if (targetEl) targetEl.classList.remove('hidden');

      highestUnlockedStep = Math.max(highestUnlockedStep, targetStep);

      document.querySelectorAll('.step-item').forEach((el, idx) => {
        const stepNum = idx + 1;
        el.classList.remove('active', 'completed', 'unlocked');
        if (stepNum < targetStep) el.classList.add('completed');
        else if (stepNum === targetStep) el.classList.add('active');
        else if (stepNum <= highestUnlockedStep) el.classList.add('unlocked');
      });

      currentStep = targetStep;

      if (targetStep === 2) {
        formData = collectFormData();
        window.HomeBrief.formData = formData;
        window.HomeBrief.PlotEditor.init('plot-canvas-container', formData);
      } else if (targetStep === 3) {
        formData = collectFormData();
        plotData = window.HomeBrief.PlotEditor.getPlotData();
        window.HomeBrief.formData = formData;
        window.HomeBrief.plotData = plotData;
        generatePlan();
      }

      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function generatePlan() {
      layoutData = window.HomeBrief.LayoutEngine.generate(formData, plotData);
      window.HomeBrief.layoutData = layoutData;

      const numFloors = layoutData.options[currentOption].floors.length;
      if (currentFloor >= numFloors) currentFloor = 0;

      // Sync Option A / B labels for the selected Building Type
      document.querySelectorAll('.option-toggle-btn').forEach(btn => {
        const idx = parseInt(btn.dataset.option, 10) || 0;
        if (layoutData.options[idx]) {
          btn.textContent = layoutData.options[idx].name;
        }
      });

      setupFloorTabs();
      renderPlan();
      populateSharedSummaries();
      populateCostEstimate();
      populateNotes();
      populateQuestions();
    }

    function setupFloorTabs() {
      const container = document.getElementById('floor-tabs');
      if (!container || !layoutData) return;

      const floors = layoutData.options[currentOption].floors;
      container.innerHTML = '';

      floors.forEach((fl, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'floor-tab' + (idx === currentFloor ? ' active' : '');
        btn.textContent = fl.name;
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', idx === currentFloor ? 'true' : 'false');
        btn.addEventListener('click', () => {
          currentFloor = idx;
          setupFloorTabs();
          renderPlan();
        });
        container.appendChild(btn);
      });
    }

    function renderPlan() {
      if (!layoutData) return;
      window.HomeBrief.PlanRenderer.render('plan-container', layoutData, formData, {
        floorIndex: currentFloor,
        optionIndex: currentOption
      });
      applyZoom();
    }

    function applyZoom() {
      const container = document.getElementById('plan-container');
      if (!container) return;
      container.style.width = zoomPct + '%';
    }

    /**
     * Populate BOTH the bottom Plan Summary bar AND the Sidebar Summary Cards
     * from ONE shared computation (identical rounded numbers everywhere).
     */
    function populateSharedSummaries() {
      if (!layoutData) return;
      const m = window.HomeBrief.LayoutEngine.computeSpaceMetrics(formData, plotData, layoutData);

      const grid = document.getElementById('summary-grid');
      if (grid) {
        const cards = [
          { label: 'Plot Area', value: `${m.plotSqFt.toLocaleString('en-IN')} Sq.Ft`, sub: `${m.plotCents} Cents` },
          { label: 'Total Built-up Area', value: `${m.builtUpSqFt.toLocaleString('en-IN')} Sq.Ft`, sub: `${formData.floors} · ${formData.config}` },
          { label: 'Est. Carpet Area', value: `${m.carpetSqFt.toLocaleString('en-IN')} Sq.Ft`, sub: '~77% Usable Area' },
          { label: 'Open / Setback Area', value: `${m.openPct}%`, sub: `${m.openSqFt.toLocaleString('en-IN')} Sq.Ft Open` }
        ];

        grid.innerHTML = cards.map(c => `
          <div class="stat-card">
            <div class="stat-label">${c.label}</div>
            <div class="stat-value">${c.value}</div>
            <div class="helper-text">${c.sub}</div>
          </div>
        `).join('');
      }

      const bar = document.getElementById('plan-summary-bar');
      if (bar) {
        const bLabel = BUILDING_TYPE_LABELS[formData.buildingType] || 'Residential';
        const facingLabel = (formData.roadFacing || 'east').toUpperCase() + (formData.cornerPlot ? ' (Corner)' : '');
        bar.innerHTML = `
          <span class="plan-summary-item"><strong>Plan Summary:</strong> ${bLabel} (${formData.floors}, ${formData.config})</span>
          <span class="plan-summary-item"><strong>Plot:</strong> ${m.plotCents} Cents (${m.plotSqFt.toLocaleString('en-IN')} Sq.Ft)</span>
          <span class="plan-summary-item"><strong>Built-up:</strong> ${m.builtUpSqFt.toLocaleString('en-IN')} Sq.Ft</span>
          <span class="plan-summary-item"><strong>Carpet:</strong> ~${m.carpetSqFt.toLocaleString('en-IN')} Sq.Ft</span>
          <span class="plan-summary-item"><strong>Open:</strong> ${m.openPct}% | <strong>Facing:</strong> ${facingLabel}</span>
        `;
      }
    }

    function populateCostEstimate() {
      const container = document.getElementById('cost-content');
      if (!container || !layoutData) return;

      const m = window.HomeBrief.LayoutEngine.computeSpaceMetrics(formData, plotData, layoutData);
      const baseCost = m.builtUpSqFt * formData.budgetRate;
      const lowLakhs = (baseCost * 0.9) / 100000;
      const highLakhs = (baseCost * 1.1) / 100000;
      const midLakhs = baseCost / 100000;

      const structLakhs = (baseCost * 0.45) / 100000;
      const finishLakhs = (baseCost * 0.40) / 100000;
      const mepLakhs = (baseCost * 0.15) / 100000;

      const tierLabels = {
        basic: 'Basic (₹1,800/sq.ft)',
        standard: 'Standard (₹2,100/sq.ft)',
        premium: 'Premium (₹2,600/sq.ft)'
      };

      container.innerHTML = `
        <div class="cost-total">₹${lowLakhs.toFixed(1)} – ₹${highLakhs.toFixed(1)} Lakhs</div>
        <p class="cost-range-sub">Base estimate: ₹${midLakhs.toFixed(2)} Lakhs (±10% range) at ${tierLabels[formData.budgetTier]} for ${m.builtUpSqFt.toLocaleString('en-IN')} Sq.Ft</p>
        <div class="cost-breakdown">
          <div class="breakdown-row">
            <span class="breakdown-label">Structure &amp; Civil (~45%)</span>
            <span class="breakdown-value">₹${structLakhs.toFixed(1)}L</span>
            <div class="breakdown-bar-track"><div class="breakdown-bar" style="width:45%; background:#2563EB;"></div></div>
          </div>
          <div class="breakdown-row">
            <span class="breakdown-label">Finishing &amp; Flooring (~40%)</span>
            <span class="breakdown-value">₹${finishLakhs.toFixed(1)}L</span>
            <div class="breakdown-bar-track"><div class="breakdown-bar" style="width:40%; background:#10B981;"></div></div>
          </div>
          <div class="breakdown-row">
            <span class="breakdown-label">Plumbing, Electrical &amp; Contingency (~15%)</span>
            <span class="breakdown-value">₹${mepLakhs.toFixed(1)}L</span>
            <div class="breakdown-bar-track"><div class="breakdown-bar" style="width:15%; background:#F59E0B;"></div></div>
          </div>
        </div>
      `;
    }

    function generateNotes(fData, lData) {
      const notes = [];

      if (fData.roadFacing === 'west') {
        notes.push('West-facing heat mitigation: Afternoon sun hits the road-facing facade directly. Add porch overhangs, vertical shading fins, or courtyard trees along the west edge to keep living rooms cooler.');
      } else if (fData.roadFacing === 'east') {
        notes.push('East-facing daylight advantage: Front living areas enjoy gentle morning sunlight without harsh afternoon heat. Keep front windows wide with light curtains.');
      } else if (fData.roadFacing === 'north') {
        notes.push('North-facing indirect daylight: Provides steady, glare-free natural light throughout the day—great for living rooms and home workspaces.');
      } else {
        notes.push('South-facing solar control: Use 2–3 ft window sunshades or balcony projections to block high midday summer heat while admitting pleasant winter daylight.');
      }

      if (fData.cornerPlot) {
        notes.push('Corner plot cross-ventilation: Two road-facing open sides allow fresh air circulation across rooms. Place operable windows on both exposed sides.');
      }

      if (fData.buildingType === 'duplex') {
        notes.push('Duplex vertical airflow: Because the internal staircase connects the living hall to the upper family lounge, adding a high ventilator window near the stairwell roof creates natural stack cooling.');
      } else if (fData.buildingType === 'commercial_residential') {
        notes.push('Commercial & residential separation: Keeping the side driveway and residential staircase separate from the front shop shutter ensures privacy, security, and independent utility metering.');
      } else if (fData.buildingType === 'rental_apartments') {
        notes.push('Multi-unit privacy & light: Central corridor access gives both front and rear rental units independent doors, exterior windows, and isolated wet plumbing shafts.');
      } else if (fData.buildingType === 'villa') {
        notes.push('Villa landscaped setbacks: Wider perimeter setbacks leave space for permeable garden paving, rainwater recharge pits, and shaded verandah seating.');
      }

      const ratio = (lData.plotLength || lData.plotDepth) / Math.max(1, lData.plotWidth);
      if (ratio > 1.75 || ratio < 0.57) {
        notes.push('Elongated plot ventilation: Middle zones benefit from open dining circulation and exterior-wall utility shafts to keep air moving from front to back.');
      }

      notes.push('Kitchen & bathroom exhaust: Wet zones are placed along exterior walls and stacked vertically across floors so natural exhaust and plumbing lines remain direct and leak-resistant.');

      return notes;
    }

    function populateNotes() {
      const list = document.getElementById('notes-list');
      if (!list) return;
      list.innerHTML = generateNotes(formData, layoutData).map(n => `<div class="note-item">${n}</div>`).join('');
    }

    function generateQuestions(fData, pData) {
      const questions = [
        'What are the exact local municipal setback rules, permissible Floor Space Index (FSI/FAR), and road-widening lines for this plot?'
      ];

      if (fData.buildingType === 'commercial_residential') {
        questions.push('What commercial zoning permissions, separate electric meters, and fire-exit requirements apply to the ground-floor shop frontage?');
      } else if (fData.buildingType === 'rental_apartments') {
        questions.push('How should separate water sub-meters, electrical distribution boards, and acoustic insulation between rental units be planned?');
      } else if (fData.buildingType === 'duplex') {
        questions.push('How can the structural column grid support a spacious open living-dining span and internal duplex staircase without obstructive beams?');
      } else {
        questions.push('Based on a soil bearing test at this site, is an isolated footing foundation sufficient or are combined/raft footings recommended?');
      }

      if (fData.floors === 'G') {
        questions.push('Should we size the ground-floor footings and columns now so we can safely add a first floor in the future?');
      } else {
        questions.push('Will the upper floors need a dedicated overhead tank + pressure booster pump, and where should the plumbing shafts run?');
      }

      if (fData.parking === '2cars') {
        questions.push('Is the gate width and driveway turning clearance comfortable for parking two cars independently without blocking each other?');
      } else {
        questions.push('Where should the underground sump, rainwater harvesting pit, and septic/drainage connection be located inside the open setback?');
      }

      if (pData && pData.isIrregular) {
        questions.push('Since the plot boundary is tapered/irregular, how can we best landscape or utilize the angled setback corners for garden or utility space?');
      } else {
        questions.push('What realistic stage-wise timeline and cost milestones should we plan from sanction drawings through structure and finishing?');
      }

      return questions;
    }

    function populateQuestions() {
      const list = document.getElementById('questions-list');
      if (!list) return;
      list.innerHTML = generateQuestions(formData, plotData).map(q => `<li>${q}</li>`).join('');
    }

    function downloadBlob(blob, filename) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    function exportSVG() {
      const svgStr = window.HomeBrief.PlanRenderer.exportSVG();
      if (!svgStr) return;
      downloadBlob(new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' }), 'HomeBrief_Floor_Plan.svg');
    }

    function exportPNG() {
      window.HomeBrief.PlanRenderer.exportPNG(function (dataUrl) {
        const link = document.createElement('a');
        link.download = 'HomeBrief_Floor_Plan.png';
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      });
    }

    function exportPDF() {
      if (typeof html2pdf === 'undefined') {
        window.print();
        return;
      }

      const btn = document.getElementById('btn-export-pdf');
      const origLabel = btn ? btn.textContent : '';
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Generating A4 PDF...';
      }

      const m = window.HomeBrief.LayoutEngine.computeSpaceMetrics(formData, plotData, layoutData);
      const baseCost = m.builtUpSqFt * formData.budgetRate;
      const lowL = ((baseCost * 0.9) / 100000).toFixed(1);
      const highL = ((baseCost * 1.1) / 100000).toFixed(1);
      const bLabel = BUILDING_TYPE_LABELS[formData.buildingType] || 'Residential';

      const wrapper = document.createElement('div');
      wrapper.style.padding = '20px';
      wrapper.style.fontFamily = 'Inter, Arial, sans-serif';
      wrapper.style.color = '#1E293B';
      wrapper.style.background = '#FFFFFF';
      wrapper.style.width = '710px';

      wrapper.innerHTML = `
        <div style="border-bottom:2px solid #2563EB; padding-bottom:10px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:flex-end;">
          <div>
            <h1 style="margin:0; font-size:20px; color:#2563EB;">HomeBrief — Pre-Architect Brief</h1>
            <p style="margin:2px 0 0; font-size:11px; color:#64748B;">Conceptual Space Program &amp; 2D Floor Plan</p>
          </div>
          <div style="text-align:right; font-size:10px; color:#64748B;">
            Generated: ${new Date().toLocaleDateString()}
          </div>
        </div>

        <table style="width:100%; border-collapse:collapse; font-size:11px; margin-bottom:14px;">
          <tr>
            <td style="padding:6px; border:1px solid #CBD5E1; background:#F8FAFC;"><strong>Plot Area</strong></td>
            <td style="padding:6px; border:1px solid #CBD5E1;">${m.plotCents} Cents (${m.plotSqFt.toLocaleString('en-IN')} Sq.Ft)</td>
            <td style="padding:6px; border:1px solid #CBD5E1; background:#F8FAFC;"><strong>Road Facing</strong></td>
            <td style="padding:6px; border:1px solid #CBD5E1;">${formData.roadFacing.toUpperCase()}${formData.cornerPlot ? ' (Corner Plot)' : ''}</td>
          </tr>
          <tr>
            <td style="padding:6px; border:1px solid #CBD5E1; background:#F8FAFC;"><strong>Building Type</strong></td>
            <td style="padding:6px; border:1px solid #CBD5E1;">${bLabel}</td>
            <td style="padding:6px; border:1px solid #CBD5E1; background:#F8FAFC;"><strong>Floors &amp; Config</strong></td>
            <td style="padding:6px; border:1px solid #CBD5E1;">${formData.floors} | ${formData.config} | ${formData.parking}</td>
          </tr>
          <tr>
            <td style="padding:6px; border:1px solid #CBD5E1; background:#F8FAFC;"><strong>Built-Up / Carpet</strong></td>
            <td style="padding:6px; border:1px solid #CBD5E1;">${m.builtUpSqFt.toLocaleString('en-IN')} Sq.Ft / ~${m.carpetSqFt.toLocaleString('en-IN')} Sq.Ft</td>
            <td style="padding:6px; border:1px solid #CBD5E1; background:#F8FAFC;"><strong>Est. Cost (±10%)</strong></td>
            <td style="padding:6px; border:1px solid #CBD5E1; color:#1E40AF; font-weight:bold;">₹${lowL} – ₹${highL} Lakhs (Open: ${m.openPct}%)</td>
          </tr>
        </table>

        <h2 style="font-size:13px; margin:10px 0 6px; color:#1E293B;">2D Floor Plan (${layoutData.options[currentOption].name} — ${layoutData.options[currentOption].floors[currentFloor].name})</h2>
        <div id="pdf-plan-slot" style="border:1px solid #CBD5E1; padding:6px; margin-bottom:14px;"></div>

        <h2 style="font-size:13px; margin:10px 0 6px; color:#1E293B;">Sunlight, Ventilation &amp; Practical Notes</h2>
        <ul style="margin:0 0 12px; padding-left:18px; font-size:11px; line-height:1.45;">
          ${generateNotes(formData, layoutData).map(n => `<li style="margin-bottom:4px;">${n}</li>`).join('')}
        </ul>

        <h2 style="font-size:13px; margin:10px 0 6px; color:#1E293B;">5 Smart Questions to Ask Your Architect</h2>
        <ol style="margin:0 0 12px; padding-left:18px; font-size:11px; line-height:1.45;">
          ${generateQuestions(formData, plotData).map(q => `<li style="margin-bottom:4px;">${q}</li>`).join('')}
        </ol>

        <div style="padding:8px 10px; background:#FFFBEB; border:1px solid #FDE68A; border-radius:6px; font-size:10px; color:#92400E; margin-bottom:10px;">
          <strong>Disclaimer:</strong> Educational concept plan only. Not a structural drawing or municipal approval plan. Consult a licensed architect or structural engineer before construction.
        </div>

        <div style="text-align:center; font-size:10px; color:#94A3B8; border-top:1px solid #E2E8F0; padding-top:6px;">
          Planned with HomeBrief
        </div>
      `;

      const svgEl = window.HomeBrief.PlanRenderer.getSvgElement();
      if (svgEl) {
        const clone = svgEl.cloneNode(true);
        clone.style.width = '100%';
        clone.style.height = 'auto';
        clone.style.display = 'block';
        wrapper.querySelector('#pdf-plan-slot').appendChild(clone);
      }

      document.body.appendChild(wrapper);

      const opt = {
        margin: [8, 8, 10, 8],
        filename: 'HomeBrief_Architect_Brief.pdf',
        image: { type: 'jpeg', quality: 0.96 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
      };

      html2pdf().set(opt).from(wrapper).save()
        .then(() => {
          document.body.removeChild(wrapper);
          if (btn) {
            btn.disabled = false;
            btn.textContent = origLabel;
          }
        })
        .catch(() => {
          if (wrapper.parentNode) document.body.removeChild(wrapper);
          if (btn) {
            btn.disabled = false;
            btn.textContent = origLabel;
          }
        });
    }

    function toggleFullscreen() {
      const card = document.getElementById('plan-viewer-card');
      const btn = document.getElementById('btn-fullscreen');
      if (!card || !btn) return;

      const isFs = card.classList.toggle('is-fullscreen');
      document.body.classList.toggle('plan-fullscreen-active', isFs);
      btn.textContent = isFs ? 'Exit Fullscreen' : 'Fullscreen';
    }

    function bindEvents() {
      document.querySelectorAll('.option-group').forEach(group => {
        group.querySelectorAll('.option-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            group.querySelectorAll('.option-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
          });
        });
      });

      const btSelect = document.getElementById('building-type');
      const btHint = document.getElementById('building-type-hint');
      btSelect?.addEventListener('change', () => {
        if (btHint) btHint.textContent = BUILDING_TYPE_HINTS[btSelect.value] || '';
      });

      document.getElementById('land-area')?.addEventListener('input', updateAreaConversion);
      document.getElementById('land-unit')?.addEventListener('change', updateAreaConversion);

      document.getElementById('btn-to-step2')?.addEventListener('click', () => goToStep(2));
      document.getElementById('btn-to-step3')?.addEventListener('click', () => goToStep(3));
      document.querySelectorAll('.btn-back').forEach(btn => {
        btn.addEventListener('click', () => {
          const dest = parseInt(btn.dataset.goto, 10);
          if (dest) goToStep(dest);
        });
      });

      document.querySelectorAll('.step-item').forEach(el => {
        el.addEventListener('click', () => {
          const stepNum = parseInt(el.dataset.step, 10);
          if (stepNum <= highestUnlockedStep && stepNum !== currentStep) {
            goToStep(stepNum);
          }
        });
      });

      document.querySelectorAll('.option-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.option-toggle-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          currentOption = parseInt(btn.dataset.option, 10) || 0;
          setupFloorTabs();
          renderPlan();
        });
      });

      // Viewer zoom & fullscreen controls
      document.getElementById('btn-zoom-in')?.addEventListener('click', () => {
        zoomPct = Math.min(220, zoomPct + 20);
        applyZoom();
      });
      document.getElementById('btn-zoom-out')?.addEventListener('click', () => {
        zoomPct = Math.max(70, zoomPct - 20);
        applyZoom();
      });
      document.getElementById('btn-zoom-reset')?.addEventListener('click', () => {
        zoomPct = 100;
        applyZoom();
      });
      document.getElementById('btn-fullscreen')?.addEventListener('click', toggleFullscreen);

      document.getElementById('btn-export-svg')?.addEventListener('click', exportSVG);
      document.getElementById('btn-export-png')?.addEventListener('click', exportPNG);
      document.getElementById('btn-export-pdf')?.addEventListener('click', exportPDF);
    }

    return {
      init() {
        bindEvents();
        updateAreaConversion();
        formData = collectFormData();
        window.HomeBrief.formData = formData;
      },
      goToStep,
      getFormData() {
        return formData;
      }
    };
  })();

  window.HomeBrief.App.init();
});
