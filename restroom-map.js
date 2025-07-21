/*
 * NYC PUBLIC RESTROOMS INTERACTIVE MAP
 * ====================================
 * 
 * This script creates an interactive map displaying all public restroom facilities
 * across New York City. Features include:
 * - Real-time status filtering (Operational, Not Operational, Under Construction)
 * - Accessibility information and filtering
 * - Location type filtering (Parks, Libraries, Other facilities)
 * - Search functionality by facility name
 * - Geolocation support to find nearby facilities
 * - Detailed popup information for each facility
 * - Statistics panel showing current filter results
 * 
 * DATA SOURCE: NYC Open Data - Public Restrooms
 * Map powered by Mapbox GL JS
 */

// Main application function
var restroomMapApp = function() {
  // ============================================================================
  // TOKEN MANAGEMENT
  // ============================================================================
  const STORAGE_KEY = 'mapbox_access_token';
  let userToken = localStorage.getItem(STORAGE_KEY);
  
  // Check if we have a stored token
  if (userToken) {
    // Hide token section and show map
    document.getElementById('tokenSection').classList.add('hidden');
    document.getElementById('mapSection').classList.remove('hidden');
    initializeMap(userToken);
  } else {
    // Show token section and hide map
    document.getElementById('tokenSection').classList.remove('hidden');
    document.getElementById('mapSection').classList.add('hidden');
    setupTokenInput();
  }
};

// Setup token input handling
function setupTokenInput() {
  const tokenInput = document.getElementById('mapboxToken');
  const submitButton = document.getElementById('submitToken');
  
  // Handle token submission
  submitButton.addEventListener('click', function() {
    const token = tokenInput.value.trim();
    
    if (!token) {
      alert('토큰을 입력해주세요!');
      tokenInput.focus();
      return;
    }
    
    if (!token.startsWith('pk.')) {
      alert('유효한 Mapbox 토큰을 입력해주세요. 토큰은 "pk."로 시작해야 합니다.');
      tokenInput.focus();
      return;
    }
    
    // Store token and initialize map
    localStorage.setItem('mapbox_access_token', token);
    
    // Hide token section and show map with animation
    document.getElementById('tokenSection').classList.add('hidden');
    document.getElementById('mapSection').classList.remove('hidden');
    
    // Scroll to map section
    setTimeout(() => {
      document.getElementById('mapSection').scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start' 
      });
    }, 100);
    
    initializeMap(token);
  });
  
  // Handle Enter key
  tokenInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      submitButton.click();
    }
  });
  
  // Auto-focus on token input
  setTimeout(() => {
    tokenInput.focus();
  }, 100);
}

// Initialize map with provided token
function initializeMap(token) {
  // ============================================================================
  // MAPBOX CONFIGURATION
  // ============================================================================
  mapboxgl.accessToken = token;

  const map = new mapboxgl.Map({
      container: 'mapbox-container-restrooms',
      style: 'mapbox://styles/mapbox/streets-v12', // Using streets style for better navigation
      center: [-73.935242, 40.730610], // NYC center
      zoom: 11,
      pitch: 0,
      bearing: 0
  });

  // ============================================================================
  // GLOBAL VARIABLES
  // ============================================================================
  let allRestroomData = null;
  let currentFilters = {
      search: '',
      status: 'all',
      accessibility: 'all',
      locationType: 'all'
  };
  let userLocation = null;
  let isHeatmapVisible = false;
  let heatmapData = null;

  // ============================================================================
  // MAP SETUP AND CONTROLS
  // ============================================================================
  map.addControl(new mapboxgl.NavigationControl(), 'top-right');
  map.addControl(new mapboxgl.FullscreenControl(), 'top-right');
  map.addControl(new mapboxgl.ScaleControl({
      maxWidth: 80,
      unit: 'imperial'
  }), 'bottom-left');

  // ============================================================================
  // GEOLOCATION CONTROL
  // ============================================================================
  const geolocateControl = new mapboxgl.GeolocateControl({
      positionOptions: {
          enableHighAccuracy: true
      },
      trackUserLocation: true,
      showUserHeading: true
  });
  map.addControl(geolocateControl, 'top-right');

  // ============================================================================
  // MAP LOAD EVENT
  // ============================================================================
  map.on('load', () => {
      console.log('Map loaded successfully!');
      loadRestroomData();
      addTokenControls(); // Add token management controls
  });

  // ============================================================================
  // DATA LOADING FUNCTION
  // ============================================================================
  function loadRestroomData() {
      console.log('Loading public restroom data...');
      
      fetch('Public Restrooms_20250720.geojson')
          .then(response => {
              if (!response.ok) {
                  throw new Error(`HTTP error! status: ${response.status}`);
              }
              return response.json();
          })
          .then(data => {
              console.log('Restroom data loaded successfully!');
              console.log(`Total facilities: ${data.features.length}`);
              
              allRestroomData = data;
              setupMapLayers(data);
              setupEventListeners();
              
              // Auto-fit map to data
              fitMapToData();
              
              console.log('Map initialization complete!');
          })
          .catch(error => {
              console.error('Error loading restroom data:', error);
              showErrorMessage(error);
          });
  }

  // ============================================================================
  // MAP LAYERS SETUP
  // ============================================================================
  function setupMapLayers(data) {
      // Add data source
      map.addSource('restrooms', {
          'type': 'geojson',
          'data': data
      });

      // Add circle layer for restroom locations
      map.addLayer({
          'id': 'restroom-points',
          'type': 'circle',
          'source': 'restrooms',
          'paint': {
              'circle-radius': [
                  'case',
                  ['==', ['get', 'status'], 'Operational'], 8,
                  ['==', ['get', 'status'], 'Not Operational'], 6,
                  5 // Default for other statuses
              ],
              'circle-color': [
                  'case',
                  ['==', ['get', 'status'], 'Operational'], '#22c55e', // Green for operational
                  ['==', ['get', 'status'], 'Not Operational'], '#ef4444', // Red for not operational
                  ['==', ['get', 'status'], 'Closed for Construction'], '#f59e0b', // Orange for construction
                  '#6b7280' // Gray for unknown status
              ],
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 2,
              'circle-opacity': 0.8
          }
      });

      // Add hover effects
      map.on('mouseenter', 'restroom-points', () => {
          map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mouseleave', 'restroom-points', () => {
          map.getCanvas().style.cursor = '';
      });

      // Add click events for popups
      map.on('click', 'restroom-points', (e) => {
          const coordinates = e.features[0].geometry.coordinates.slice();
          const props = e.features[0].properties;
          
          // Ensure popup appears even if map is zoomed out
          while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
              coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
          }

          const popupContent = createPopupContent(props);
          
          new mapboxgl.Popup()
              .setLngLat(coordinates)
              .setHTML(popupContent)
              .addTo(map);
      });
  }

  // ============================================================================
  // POPUP CONTENT CREATION
  // ============================================================================
  function createPopupContent(props) {
      const statusColor = getStatusColor(props.status);
      const accessibilityIcon = getAccessibilityIcon(props.accessibility);
      const locationTypeIcon = getLocationTypeIcon(props.location_type);
      
      return `
          <div class="restroom-popup">
              <h3 style="margin: 0 0 10px 0; color: #333;">
                  ${locationTypeIcon} ${props.facility_name || 'Public Restroom'}
              </h3>
              
              <div class="popup-section">
                  <strong>📍 Status:</strong> 
                  <span style="color: ${statusColor}; font-weight: bold;">
                      ${props.status || 'Unknown'}
                  </span>
              </div>
              
              ${props.accessibility ? `
              <div class="popup-section">
                  <strong>${accessibilityIcon} Accessibility:</strong> ${props.accessibility}
              </div>` : ''}
              
              ${props.location_type ? `
              <div class="popup-section">
                  <strong>🏢 Location Type:</strong> ${props.location_type}
              </div>` : ''}
              
              ${props.operator ? `
              <div class="popup-section">
                  <strong>🏛️ Operated by:</strong> ${props.operator}
              </div>` : ''}
              
              ${props.hours_of_operation ? `
              <div class="popup-section">
                  <strong>🕐 Hours:</strong> ${props.hours_of_operation}
              </div>` : ''}
              
              ${props.restroom_type ? `
              <div class="popup-section">
                  <strong>🚻 Type:</strong> ${props.restroom_type}
              </div>` : ''}
              
              ${props.changing_stations && props.changing_stations !== 'null' ? `
              <div class="popup-section">
                  <strong>👶 Changing Stations:</strong> ${props.changing_stations}
              </div>` : ''}
              
              ${props.website ? `
              <div class="popup-section">
                  <strong>🌐 Website:</strong> 
                  <a href="${props.website}" target="_blank" style="color: #3b82f6;">Visit Site</a>
              </div>` : ''}
              
              ${props.additional_notes ? `
              <div class="popup-section">
                  <strong>📝 Notes:</strong> ${props.additional_notes}
              </div>` : ''}
              
              <div class="popup-section" style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">
                  📍 Coordinates: ${props.latitude}, ${props.longitude}
              </div>
          </div>
      `;
  }

  // ============================================================================
  // HELPER FUNCTIONS FOR POPUP
  // ============================================================================
  function getStatusColor(status) {
      switch(status) {
          case 'Operational': return '#22c55e';
          case 'Not Operational': return '#ef4444';
          case 'Closed for Construction': return '#f59e0b';
          default: return '#6b7280';
      }
  }

  function getAccessibilityIcon(accessibility) {
      switch(accessibility) {
          case 'Fully Accessible': return '♿';
          case 'Partially Accessible': return '🚪';
          default: return '❓';
      }
  }

  function getLocationTypeIcon(locationType) {
      switch(locationType) {
          case 'Park': return '🌳';
          case 'Library': return '📚';
          default: return '🏛️';
      }
  }

  // ============================================================================
  // HEAT MAP FUNCTIONS
  // ============================================================================
  function generateCoverageHeatmap() {
      if (!allRestroomData) return;

      console.log('Generating emergency zone analysis with moderate criteria (1km max danger zone)...');

      // NYC bounds with slightly expanded area for better coverage
      const nycBounds = {
          north: 40.925,
          south: 40.470,
          east: -73.680,
          west: -74.280
      };

      const gridSize = 100; // 100x100 grid for higher resolution
      const latStep = (nycBounds.north - nycBounds.south) / gridSize;
      const lngStep = (nycBounds.east - nycBounds.west) / gridSize;

      const heatmapPoints = [];
      
      // Pre-extract restroom coordinates for faster processing
      const restroomCoords = allRestroomData.features.map(restroom => 
          restroom.geometry.coordinates
      );

      console.log(`Processing ${gridSize}x${gridSize} grid (${gridSize * gridSize} points)...`);

      // Generate grid points and calculate distance to nearest restroom
      for (let i = 0; i < gridSize; i++) {
          for (let j = 0; j < gridSize; j++) {
              const lat = nycBounds.south + (i * latStep);
              const lng = nycBounds.west + (j * lngStep);

              // Find nearest restroom using optimized distance calculation
              let minDistance = Infinity;
              for (const coords of restroomCoords) {
                  const [rLng, rLat] = coords;
                  const distance = calculateFastDistance(lat, lng, rLat, rLng);
                  if (distance < minDistance) {
                      minDistance = distance;
                  }
              }

              // Enhanced intensity calculation with more generous scaling
              const maxDistance = 1000; // 1km max distance for more generous scaling
              let intensity = Math.min(minDistance / maxDistance, 1);
              
              // Apply moderate non-linear scaling for better contrast
              intensity = Math.pow(intensity, 0.6);

              heatmapPoints.push([lng, lat, intensity]);
          }
      }

      console.log(`Generated ${heatmapPoints.length} heatmap points`);

      return {
          type: 'FeatureCollection',
          features: [{
              type: 'Feature',
              geometry: {
                  type: 'Point',
                  coordinates: [0, 0] // Dummy point
              },
              properties: {
                  heatmapData: heatmapPoints
              }
          }]
      };
  }

  // Faster distance calculation for heatmap generation
  function calculateFastDistance(lat1, lng1, lat2, lng2) {
      // Simplified distance calculation for performance
      const dLat = (lat2 - lat1) * 111000; // ~111km per degree latitude
      const dLng = (lng2 - lng1) * 85000; // ~85km per degree longitude at NYC latitude
      return Math.sqrt(dLat * dLat + dLng * dLng);
  }

  function calculateDistance(lat1, lng1, lat2, lng2) {
      const R = 6371000; // Earth's radius in meters
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLng/2) * Math.sin(dLng/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
  }

  function toggleHeatmap() {
      const button = document.getElementById('toggleHeatmap');
      const legend = document.getElementById('heatmapLegend');

      console.log('Toggle heatmap clicked. Current state:', isHeatmapVisible);

      if (!isHeatmapVisible) {
          // Generate and show heatmap
          if (!heatmapData) {
              button.textContent = 'Generating Danger Zone Analysis...';
              button.disabled = true;
              
              setTimeout(() => {
                  console.log('Generating emergency zone analysis...');
                  const startTime = performance.now();
                  heatmapData = generateCoverageHeatmap();
                  const endTime = performance.now();
                  console.log(`Emergency zone analysis completed in ${(endTime - startTime).toFixed(2)}ms`);
                  console.log('Heatmap data generated:', heatmapData);
                  
                  addHeatmapLayer();
                  isHeatmapVisible = true;
                  button.textContent = 'Hide Danger Zone Analysis';
                  button.disabled = false;
                  legend.classList.remove('hidden');
                  console.log('Danger zone analysis layer added and visible');
              }, 100);
          } else {
              addHeatmapLayer();
              isHeatmapVisible = true;
              button.textContent = 'Hide Danger Zone Analysis';
              legend.classList.remove('hidden');
              console.log('Existing danger zone analysis made visible');
          }
      } else {
          // Hide heatmap
          removeHeatmapLayer();
          isHeatmapVisible = false;
          button.textContent = 'Show Danger Zone Analysis';
          legend.classList.add('hidden');
          console.log('Danger zone analysis hidden');
      }
  }

  function addHeatmapLayer() {
      if (!heatmapData) {
          console.error('No heatmap data available');
          return;
      }

      console.log('Adding heatmap layer...');

      // Remove existing layer if it exists
      if (map.getLayer('heatmap-layer')) {
          map.removeLayer('heatmap-layer');
      }
      if (map.getSource('heatmap-source')) {
          map.removeSource('heatmap-source');
      }

      const heatmapPoints = heatmapData.features[0].properties.heatmapData;
      console.log('Heatmap points count:', heatmapPoints.length);
      
      // Create GeoJSON from heatmap points
      const heatmapGeoJSON = {
          type: 'FeatureCollection',
          features: heatmapPoints.map(point => ({
              type: 'Feature',
              geometry: {
                  type: 'Point',
                  coordinates: [point[0], point[1]]
              },
              properties: {
                  intensity: point[2]
              }
          }))
      };

      console.log('Created heatmap GeoJSON with', heatmapGeoJSON.features.length, 'features');

      map.addSource('heatmap-source', {
          type: 'geojson',
          data: heatmapGeoJSON
      });

      map.addLayer({
          id: 'heatmap-layer',
          type: 'heatmap',
          source: 'heatmap-source',
          maxzoom: 15,
          paint: {
              'heatmap-weight': ['get', 'intensity'],
              'heatmap-intensity': [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  0, 0.7,
                  10, 1.0,
                  15, 1.8
              ],
              'heatmap-color': [
                  'interpolate',
                  ['linear'],
                  ['heatmap-density'],
                  0, 'rgba(0,255,0,0)',
                  0.1, 'rgba(0,255,0,0.5)',     // Safe: < 200m
                  0.3, 'rgba(128,255,0,0.6)',   // Caution: 200-400m
                  0.5, 'rgba(255,255,0,0.6)',   // Risk: 400-600m
                  0.7, 'rgba(255,128,0,0.7)',   // Danger: 600-800m
                  0.9, 'rgba(255,64,0,0.8)',    // High Danger: 800-1000m
                  1, 'rgba(255,0,0,0.9)'        // Critical: > 1000m
              ],
              'heatmap-radius': [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  0, 18,
                  10, 30,
                  15, 45
              ],
              'heatmap-opacity': [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  0, 0.6,
                  10, 0.7,
                  15, 0.8
              ]
          }
      }, 'restroom-points');

      console.log('Emergency zone analysis layer added successfully');
  }

  function removeHeatmapLayer() {
      if (map.getLayer('heatmap-layer')) {
          map.removeLayer('heatmap-layer');
      }
      if (map.getSource('heatmap-source')) {
          map.removeSource('heatmap-source');
      }
  }

  // ============================================================================
  // EVENT LISTENERS SETUP
  // ============================================================================
  function setupEventListeners() {
      // Search functionality
      document.getElementById('searchFacility').addEventListener('input', (e) => {
          currentFilters.search = e.target.value.toLowerCase();
          applyFilters();
      });

      // Status filter
      document.getElementById('statusFilter').addEventListener('change', (e) => {
          currentFilters.status = e.target.value;
          applyFilters();
      });

      // Accessibility filter
      document.getElementById('accessibilityFilter').addEventListener('change', (e) => {
          currentFilters.accessibility = e.target.value;
          applyFilters();
      });

      // Location type filter
      document.getElementById('locationTypeFilter').addEventListener('change', (e) => {
          currentFilters.locationType = e.target.value;
          applyFilters();
      });

      // Button event listeners
      document.getElementById('resetAllFilters').addEventListener('click', resetAllFilters);
      document.getElementById('fitToRestrooms').addEventListener('click', fitMapToData);
      document.getElementById('findNearMe').addEventListener('click', findNearMe);
      document.getElementById('toggleHeatmap').addEventListener('click', toggleHeatmap);

      // Keyboard shortcuts
      document.addEventListener('keydown', handleKeyboardShortcuts);
  }

  // ============================================================================
  // FILTER APPLICATION
  // ============================================================================
  function applyFilters() {
      if (!allRestroomData) return;

      let filteredFeatures = allRestroomData.features.filter(feature => {
          const props = feature.properties;
          
          // Search filter
          if (currentFilters.search !== '') {
              const searchableText = [
                  props.facility_name,
                  props.operator,
                  props.location_type
              ].join(' ').toLowerCase();
              
              if (!searchableText.includes(currentFilters.search)) {
                  return false;
              }
          }

          // Status filter
          if (currentFilters.status !== 'all' && props.status !== currentFilters.status) {
              return false;
          }

          // Accessibility filter
          if (currentFilters.accessibility !== 'all' && props.accessibility !== currentFilters.accessibility) {
              return false;
          }

          // Location type filter
          if (currentFilters.locationType !== 'all' && props.location_type !== currentFilters.locationType) {
              return false;
          }

          return true;
      });

      // Update map data
      map.getSource('restrooms').setData({
          type: 'FeatureCollection',
          features: filteredFeatures
      });
  }

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================
  function resetAllFilters() {
      currentFilters = {
          search: '',
          status: 'all',
          accessibility: 'all',
          locationType: 'all'
      };

      document.getElementById('searchFacility').value = '';
      document.getElementById('statusFilter').value = 'all';
      document.getElementById('accessibilityFilter').value = 'all';
      document.getElementById('locationTypeFilter').value = 'all';

      applyFilters();
  }

  function fitMapToData() {
      if (!allRestroomData) return;

      const bounds = new mapboxgl.LngLatBounds();
      allRestroomData.features.forEach(feature => {
          bounds.extend(feature.geometry.coordinates);
      });

      map.fitBounds(bounds, {
          padding: 50,
          duration: 2000,
          maxZoom: 15
      });
  }

  function findNearMe() {
      if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
              (position) => {
                  const userLng = position.coords.longitude;
                  const userLat = position.coords.latitude;
                  
                  map.flyTo({
                      center: [userLng, userLat],
                      zoom: 14,
                      duration: 2000
                  });

                  // Add user location marker
                  new mapboxgl.Marker({ color: '#3b82f6' })
                      .setLngLat([userLng, userLat])
                      .addTo(map);
              },
              (error) => {
                  console.error('Geolocation error:', error);
                  alert('Unable to access your location. Please enable location services.');
              }
          );
      } else {
          alert('Geolocation is not supported by this browser.');
      }
  }

  function handleKeyboardShortcuts(e) {
      switch(e.key.toLowerCase()) {
          case 'f':
              e.preventDefault();
              fitMapToData();
              break;
          case 'r':
              e.preventDefault();
              resetAllFilters();
              break;
          case 'escape':
              e.preventDefault();
              document.getElementById('searchFacility').value = '';
              currentFilters.search = '';
              applyFilters();
              break;
      }
  }

  function showErrorMessage(error) {
      const errorDiv = document.createElement('div');
      errorDiv.style.cssText = `
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: #fee2e2;
          color: #dc2626;
          padding: 20px;
          border-radius: 8px;
          border: 1px solid #fecaca;
          text-align: center;
          z-index: 1000;
          max-width: 400px;
      `;
      errorDiv.innerHTML = `
          <h3>❌ Error Loading Data</h3>
          <p>Could not load the public restroom data. Please make sure you're running this on a local server.</p>
          <p><strong>Error:</strong> ${error.message}</p>
          <p><em>💡 Tip: Use VS Code Live Server or Python's http.server to run locally.</em></p>
      `;
      document.getElementById('mapbox-container-restrooms').appendChild(errorDiv);
  }

  // ============================================================================
  // INITIALIZATION COMPLETE
  // ============================================================================
  console.log('🚻 NYC Public Restrooms Map Application Initialized');
  console.log('🎮 Keyboard Shortcuts: F = Fit to data, R = Reset filters, Escape = Clear search');
  
  // Add token reset functionality (for debugging/testing)
  window.resetMapboxToken = function() {
    localStorage.removeItem('mapbox_access_token');
    location.reload();
  };
}

// Add token management controls to the page
function addTokenControls() {
  const controls = document.querySelector('.controls');
  if (controls && localStorage.getItem('mapbox_access_token')) {
    const tokenControl = document.createElement('div');
    tokenControl.className = 'filter-group';
    tokenControl.innerHTML = `
      <button id="resetToken" style="background: #dc2626; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
        Change Token
      </button>
    `;
    controls.appendChild(tokenControl);
    
    document.getElementById('resetToken').addEventListener('click', function() {
      if (confirm('토큰을 변경하시겠습니까? 토큰 입력 화면으로 돌아갑니다.')) {
        localStorage.removeItem('mapbox_access_token');
        
        // Show token section and hide map
        document.getElementById('mapSection').classList.add('hidden');
        document.getElementById('tokenSection').classList.remove('hidden');
        
        // Clear the token input and focus
        const tokenInput = document.getElementById('mapboxToken');
        tokenInput.value = '';
        
        // Scroll to token section
        setTimeout(() => {
          document.getElementById('tokenSection').scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start' 
          });
          tokenInput.focus();
        }, 100);
        
        // Re-setup token input handlers
        setupTokenInput();
      }
    });
  }
}

// Execute the application
restroomMapApp();
