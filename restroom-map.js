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
  // MAPBOX CONFIGURATION
  // ============================================================================
  mapboxgl.accessToken = 'pk.eyJ1Ijoiam9yZDk3IiwiYSI6ImNtZDZsMGhnajBhemsybXBzdTBra255enQifQ.I_w0vjOBfXlpyolLu-0CzA';

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
      console.log('🗺️ Map loaded successfully!');
      loadRestroomData();
  });

  // ============================================================================
  // DATA LOADING FUNCTION
  // ============================================================================
  function loadRestroomData() {
      console.log('📊 Loading public restroom data...');
      
      fetch('Public Restrooms_20250720.geojson')
          .then(response => {
              if (!response.ok) {
                  throw new Error(`HTTP error! status: ${response.status}`);
              }
              return response.json();
          })
          .then(data => {
              console.log('✅ Restroom data loaded successfully!');
              console.log(`📍 Total facilities: ${data.features.length}`);
              
              allRestroomData = data;
              setupMapLayers(data);
              setupEventListeners();
              updateStatistics();
              
              // Auto-fit map to data
              fitMapToData();
              
              console.log('🎉 Map initialization complete!');
          })
          .catch(error => {
              console.error('❌ Error loading restroom data:', error);
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

      updateStatistics(filteredFeatures);
  }

  // ============================================================================
  // STATISTICS UPDATE
  // ============================================================================
  function updateStatistics(features = null) {
      const data = features || allRestroomData.features;
      
      document.getElementById('totalVisible').textContent = data.length;
      
      const operational = data.filter(f => f.properties.status === 'Operational').length;
      document.getElementById('operationalCount').textContent = operational;
      
      const accessible = data.filter(f => f.properties.accessibility === 'Fully Accessible').length;
      document.getElementById('accessibleCount').textContent = accessible;
      
      const parks = data.filter(f => f.properties.location_type === 'Park').length;
      document.getElementById('parkCount').textContent = parks;
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
};

// Execute the application
restroomMapApp();
