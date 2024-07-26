function parseSearchData(data) {
    if (!data){
        return []
    }
    const result = []

    for (let i=0;i<data.features.length; i++){
        const address = data.features[i].properties.label
        const coordinates = data.features[i].geometry.coordinates
        result.push({address:address, coordinates: coordinates})
    }
    return result
}

function pointInPolygon(point, polygon) {
  // Extract the point coordinates
  const x = point[0];
  const y = point[1];

  // Extract the polygon vertices
  const vertices = polygon.coordinates[0];

  // Initialize a flag to track whether the point is inside
  let inside = false;

  // Iterate over the polygon vertices
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i][0];
    const yi = vertices[i][1];
    const xj = vertices[j][0];
    const yj = vertices[j][1];

    // Check if the point is within the y-range of the current edge
    if ((yi <= y && y < yj) || (yj <= y && y < yi)) {
      // Calculate the slope of the edge
      const slope = (xj - xi) * (y - yi) / (yj - yi) + xi;

      // Check if the point is to the left of the edge
      if (x < slope) {
        // Flip the inside flag
        inside = !inside;
      }
    }
  }

  return inside; // Return true if the point is inside, false otherwise
}


function getStopsInPolygon(data, polygon) {
  const stopsInPolygon = [];

  data.forEach(stop => {
    const point = [stop.stop_lon, stop.stop_lat];
    if (pointInPolygon(point, polygon)) {
      stopsInPolygon.push(stop);
    }
  });

  return stopsInPolygon;
}

function midpoint(coord1, coord2) {
  // Convert coordinates from decimal degrees to radians
  const [lat1, lon1] = coord1.map(n => n * Math.PI / 180);
  const [lat2, lon2] = coord2.map(n => n * Math.PI / 180);

  // Calculate the sum of the coordinates for the midpoint formula
  const sumX = Math.cos(lat1) * Math.cos(lon1) + Math.cos(lat2) * Math.cos(lon2);
  const sumY = Math.cos(lat1) * Math.sin(lon1) + Math.cos(lat2) * Math.sin(lon2);
  const sumZ = Math.sin(lat1) + Math.sin(lat2);

  // Calculate the average of the sums
  const avgX = sumX / 2;
  const avgY = sumY / 2;
  const avgZ = sumZ / 2;

  // Calculate the longitude of the midpoint using the atan2 function
  const lon = Math.atan2(avgY, avgX);
  // Calculate the hypotenuse for the latitude calculation
  const hyp = Math.sqrt(avgX * avgX + avgY * avgY);
  // Calculate the latitude of the midpoint
  const lat = Math.atan2(avgZ, hyp);

  // Convert the midpoint coordinates back to decimal degrees
  const midpointLat = lat * 180 / Math.PI;
  const midpointLon = lon * 180 / Math.PI;

  return [midpointLat, midpointLon];
}

function parseRouteData(data) {
  // Initialize an empty array to hold processed trip data
  let tripMaps = [];
  // Initialize a Set to keep track of unique trips
  const uniqueTrips = new Set();

  // Function to process individual trip data and format it into a consistent structure
  function processTrip(trip) {
    const processedTrip = {
      tripId: trip.tripId,
      tripHeadsign: trip.tripHeadsign,
      routeId: trip.routeId,
      startStopId: trip.startStopId,
      startStopName: trip.startStopName,
      endStopName: trip.endStopName,
      endStopId: trip.endStopId,
      stopCoordinates: trip.stopCoordinates,
      startStopCoordinates: [trip.startStopLon, trip.startStopLat],
      endStopCoordinates: [trip.endStopLon, trip.endStopLat],
      departureTime: trip.departureTimes[0],
      arrivalTime: trip.arrivalTimes[0],
      isDelayed: trip.isDelayed,
      delayMin: trip.delayMin,
      transfers: []  // Initialize an empty array to hold transfer data
    };

    return processedTrip;
  }

  // Helper function to merge new trip data into existing trip data if they are similar
  function mergeTrips(existingTrip, newTrip) {
    // If the new trip has an earlier departure time or same departure time but a lower tripId, update the existing trip
    if (newTrip.departureTime < existingTrip.departureTime ||
      (newTrip.departureTime === existingTrip.departureTime && newTrip.tripId < existingTrip.tripId)){
      existingTrip.tripId = newTrip.tripId;
      existingTrip.departureTime = newTrip.departureTime;
      existingTrip.arrivalTime = newTrip.arrivalTime;
      existingTrip.isDelayed = newTrip.isDelayed;
      existingTrip.delayMin = newTrip.delayMin;
    }
  }

  // Recursive function to flatten nested trip data structures
  function flattenTrips(data) {
    data.forEach(item => {
      if (Array.isArray(item)) {
        // If the item is an array, call flattenTrips recursively
        flattenTrips(item);
      } else {
        // Process the trip data into a standardized format
        const processedTrip = processTrip(item);
        // Check if the trip already exists in tripMaps
        const existingTrip = tripMaps.find(t =>
          t.startStopId === processedTrip.startStopId &&
          t.endStopId === processedTrip.endStopId &&
          t.routeId === processedTrip.routeId &&
          t.tripHeadsign === processedTrip.tripHeadsign
        );

        if (existingTrip) {
          // If an existing trip is found, merge the new trip data with it
          mergeTrips(existingTrip, processedTrip);
        } else {
          // If no existing trip is found, add the new trip to tripMaps
          tripMaps.push(processedTrip);
        }
      }
    });
  }

  // Function to link trips that are transfers from one to another
  function linkTransfers() {
    // Initialize an array to keep track of trips that should be removed after linking
    const tripsToRemove = [];

    tripMaps.forEach(trip => {
      tripMaps.forEach(possibleTransfer => {
        // Check if the end stop of the current trip matches the start stop of another trip
        if (trip.endStopId === possibleTransfer.startStopId) {
          // Ensure the transfer is not already included in the trip's transfers
          if (!trip.transfers.some(t =>
            t.startStopId === possibleTransfer.startStopId &&
            t.endStopId === possibleTransfer.endStopId
          )) {
            // Add the transfer to the trip's transfers array
            trip.transfers.push({ ...possibleTransfer });  // Ensure a new object is created for the transfer
            // Mark the transfer trip for removal
            tripsToRemove.push(possibleTransfer);
          }
        }
      });
    });
    // Remove trips that are marked for removal
    tripMaps = tripMaps.filter(trip => !tripsToRemove.includes(trip));
  }

  // Start processing the input data
  flattenTrips(data);
  // Link transfers between trips
  linkTransfers();

  // Return the processed trip maps
  return tripMaps;
}



function getRandomColor() {
  const colors = [
    '#FF0000',
    '#FF8700',
    '#FFD300',
    '#DEFF0A',
    '#A1FF0A',
    '#0AFF99',
    '#0AEFFF',
    '#147DF5',
    '#580AFF',
    '#BE0AFF',

  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

function convertCoordinates(coordString) {
  return coordString.split(',').map(Number);
}

function getTimeDifference(departureTime, arrivalTime){
  const time1Minutes = parseInt(departureTime.substring(0, 2)) * 60 + parseInt(departureTime.substring(3, 5));
  const time2Minutes = parseInt(arrivalTime.substring(0, 2)) * 60 + parseInt(arrivalTime.substring(3, 5));
  const differenceMinutes = time2Minutes - time1Minutes;
  return differenceMinutes
}

function encodeUrlParams(params){
  return `startLat%3A${params[0][0]}%2CstartLon%3A${params[0][1]}/endLat%3A${params[1][0]}%2CendLon%3A${params[1][1]}`
}

function addMinutesToTime(timeString, minutesToAdd) {
  const timeParts = timeString.split(':').map(Number);
  const [hours, minutes, seconds] = timeParts.length === 3 ? timeParts : [...timeParts, 0];

  const date = new Date();
  date.setHours(hours);
  date.setMinutes(minutes);
  date.setSeconds(seconds);

  date.setMinutes(date.getMinutes() + minutesToAdd);

  const newHours = String(date.getHours()).padStart(2, '0');
  const newMinutes = String(date.getMinutes()).padStart(2, '0');

  return `${newHours}:${newMinutes}`;
}

function getCurrentTimeFormatted() {
  const date = new Date();

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${hours}:${minutes}:${seconds}`;
}

export { parseSearchData, pointInPolygon, getStopsInPolygon, midpoint, parseRouteData, getRandomColor, convertCoordinates, getTimeDifference, encodeUrlParams, addMinutesToTime, getCurrentTimeFormatted}
