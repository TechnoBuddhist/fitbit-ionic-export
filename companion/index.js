import * as messaging from "messaging";
import { me } from "companion";

const DEBUG = false; // Enable console.logging & other debug stuff

const numRowsRcvd = 0;

//Message socket opens
messaging.peerSocket.onopen = function() {
  if (DEBUG) console.log("companion: Ionic Socket Open");
}

//Listen for the onbufferedamountdecrease event
messaging.peerSocket.onbufferedamountdecrease = function() {
  if (DEBUG) console.log("companion: onbufferedamountdecrease");
}

// Listen for the onmessage event
messaging.peerSocket.onmessage = function(evt) {
  // Output the message to the console
  if (DEBUG) console.log(`Rcv ${++numRowsRcvd}: ${JSON.stringify(evt.data)}`);
}

// Listen for the onerror event
messaging.peerSocket.onerror = function(err) {
  // Handle any errors
  console.log("Companion: Connection error: " + err.code + " - " + err.message);
}

//Message socket closes
messaging.peerSocket.close = function() { 
  if (DEBUG) console.log("companion: Companion Socket Closed"); 
}