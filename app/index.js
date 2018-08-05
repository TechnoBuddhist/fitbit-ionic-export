import document from "document";                // To handle the GUI
import { me } from "appbit";                    // To handle lifecycle events
import { Accelerometer } from "accelerometer";  // To get real time accelerometer readings
import { HeartRateSensor } from "heart-rate";   // To get real time Heart Rate
import { Gyroscope } from "gyroscope";          // To get real time readings
import { user } from "user-profile";            // To get gender and Resting Heart Rate
import * as messaging from "messaging";
import * as fs from "fs";                       // File System API to write files to

// ================================================================
// VARIABLE SETUP & INIT
// ================================================================
const DEBUG = false; // Enable console.logging & other debug stuff

const thisDate = new Date();
const recFilename = `RawDataLogger-${thisDate.getFullYear()}${("0" + (thisDate.getMonth() + 1)).slice(-2)}${("0" + (thisDate.getDate())).slice(-2)}.txt`;
const fileID = null;


// 4 byte integer = timestamp takes 4 bytes(milliseconds since 01-01-1970)
// 1 byte integer = 1 byte  0 < hr < 255
// 6 byte integer = 2 byte uint16 accel per x,y,z
// 6 byte integer = 2 byte uint16 gyro per x,y,z
// 17 bytes total buffer reqd
const BYTES_PER_ROW = 17;
const buffer   = new ArrayBuffer(BYTES_PER_ROW);  // ArrayBuffer used to populate the local log file
const dvTime   = new Uint32Array(buffer, 0, 1);   // Hold timestamp as 4 byte value
//const dvAccel  = new Float32Array(buffer, 4, 3);  // Hold accel.x, accel.y, accel.z
//const dvGyro   = new Float32Array(buffer, 16, 3); // Hold gyro.x, gyro.y, gyro.z
const dvAccel  = new Int16Array(buffer, 4, 3);    // Hold accel.x, accel.y, accel.z
const dvGyro   = new Int16Array(buffer, 10, 3);   // Hold gyro.x, gyro.y, gyro.z
const dvHR     = new Uint8Array(buffer, 16, 1);   // Hold the heart rate as 1 byte value
const dvGender = new Uint8Array(buffer, 4, 1);    // Hold the gender as 1 byte value(0 or 1)

const accel = new Accelerometer({ frequency: 5 });  // Samples every 1 sec
const hrm = new HeartRateSensor();
const gyro = new Gyroscope();
const timestamp = null;

const accelLabel = document.getElementById('accel-label');
const hrmLabel = document.getElementById('hrm-label');
const gyroLabel = document.getElementById('gyro-label');
const btnRecord = document.getElementById('btn-rec');
const btnSettings = document.getElementById('btn-settings');

const btnState = 'start';
const recFunction = null;
const loggingInterval = 5000;                           // Log data every 5 seconds
const closeFileFunction = setInterval(closeFd, 25000);  // flush and close buffer every 25 seconds

const numRowsSent = 0;
const numRowsTotal = 0;


btnSettings.onclick = function(evt){
  btnState = 'sending';
  //sendFile(recFilename);
  readFile(recFilename);
}

// Button is a 3 cycle button - Start -> Stop -> Send File -> Start -> ...
btnRecord.onclick = function(evt){
  if (DEBUG) console.log(`onClick currState = ${btnState}`);
  
  switch (btnState) {
    case 'start':
      deleteFile(recFilename);    // Init the logging file    
      writeProfileHeader();       // Grab basic profile data to write to head of file
      btnState = 'recording';     // We are in a recording state
      btnRecord.text = "Stop";    // Change button to 'STOP'
      sensorsStart();             // Start Sensors
      recFunction = setInterval(refreshData, loggingInterval); // Set callback recording function every 1 sec
      break;
    case 'recording':
      btnState = 'send';          // We are in a ready to SEND status
      btnRecord.text = "Send";    // Change button to "Send"  
      sensorsStop();              // Stop sensors

      // Cancel the recording functions
      clearInterval(recFunction);
      clearInterval(closeFileFunction);
      closeFd();                  // Close logging file, belt and braces
      break;
    case 'send':
      btnRecord.text = "Sending...";  // Change button to "Record"
      //readFile(recFilename);
      btnState = 'sending';           // We are in a SENDING state
      sendFile(recFilename);          // Send file to companion
      // btnState = 'start';             // We are in a ready to START state
      // btnRecord.text = 'Record';      // Change button to "Record"
      break;
    default:
      break;
  }
}

function refreshData() {
  // Populate buffer array
  dvTime[0] = Date.now();
  dvHR[0] = hrm.heartRate ? hrm.heartRate : 0;
  dvAccel[0] = accel.x ? Math.floor(accel.x.toFixed(2) * 100) : 0;
  dvAccel[1] = accel.y ? Math.floor(accel.y.toFixed(2) * 100) : 0;
  dvAccel[2] = accel.z ? Math.floor(accel.z.toFixed(2) * 100) : 0;
  dvGyro[0] = gyro.x ? Math.floor(gyro.x.toFixed(2) * 100) : 0;
  dvGyro[1] = gyro.y ? Math.floor(gyro.y.toFixed(2) * 100) : 0;
  dvGyro[2] = gyro.z ? Math.floor(gyro.z.toFixed(2) * 100) : 0;
  // console.log(`${accel.x}=${dvAccel[0]}`);
  // console.log(`${accel.y}=${dvAccel[1]}`);
  // console.log(`${accel.z}=${dvAccel[2]}`);
  // console.log(`${gyro.x}=${dvGyro[0]}`);
  // console.log(`${gyro.y}=${dvGyro[1]}`);
  // console.log(`${gyro.z}=${dvGyro[2]}`);
  
  hrmLabel.text = `HR : ${hrm.heartRate} / ${user.restingHeartRate}`;
  accelLabel.text = `Accel: ${(dvAccel[0]/100).toFixed(1)}, ${(dvAccel[1]/100).toFixed(1)}, ${(dvAccel[2]/100).toFixed(1)}`;
  gyroLabel.text = `Gyro: ${(dvGyro[0]/100).toFixed(1)}, ${(dvGyro[1]/100).toFixed(1)}, ${(dvGyro[2]/100).toFixed(1)}`;
  
  appendToFile(buffer); // Write ArrayBuffer to file
}


// Start Device Sensors
function sensorsStart(){
  accel.start();
  hrm.start();
  gyro.start();
}


// Stop Device Sensors
function sensorsStop(){
  accel.stop();
  hrm.stop();
  gyro.stop();
}

function writeProfileHeader(){
  dvTime[0] = Date.now();
  dvGender[0] = (user.gender == 'male') ? 1 : 0;
  dvHR[0] = user.restingHeartRate ? user.restingHeartRate : 0;

  if (DEBUG) console.log(`Row 1 data : Gender: ${dvGender[0]}, HR: ${dvHR[0]}, Time:${dvTime[0]}`);
  appendToFile(buffer);
}

me.onunload = function() {
  if (closeFileFunction != null) clearInterval(closeFileFunction);
  if (recFunction != null) clearInterval(recFunction);
}


// ================================================================
// FILE HANDLING
// ================================================================
function deleteFile(fn){
  // Delete the file in case there was one here from accidental start(or dev testing)
  try {
    fs.unlinkSync(fn);
    if (DEBUG) console.log(`deleted ${fn}`);
  } catch (e) {
    console.log(`Couldn't delete ${fn}`);
    console.log(e.message);
    // Do nothing if file doesn't already exist
  }
}
function appendToFile(buffer) {
  fs.writeSync(getFileID(), buffer);
}

function closeFd() {
  if (fileID != null) {
    fs.closeSync(fileID);
    fileID = null;
  }
}

function readFile(fn){
  let stats = fs.statSync(fn);
  if (stats) {
    if (DEBUG) console.log("File size: " + stats.size + " bytes = " + stats.size/BYTES_PER_ROW + " rows");
  } 
  
  if (DEBUG) console.log('Contents...');
  fileID = fs.openSync(fn, "r");
  let numRows = stats.size/BYTES_PER_ROW;
  
  fs.readSync(fileID, buffer, 0, BYTES_PER_ROW, 0);
  if (DEBUG) console.log(`Row 1 : Gender: ${dvGender[0]}, RestingHR: ${dvHR[0]}, Time: ${dvTime[0]}`);
  for (let row = 1, offset = BYTES_PER_ROW; row < numRows; ++row, offset += BYTES_PER_ROW ){
    fs.readSync(fileID, buffer, 0, BYTES_PER_ROW, row*BYTES_PER_ROW);
    if (DEBUG) console.log(`Row ${row+1} : Time: ${dvTime[0]}, HR:${dvHR[0]}, Accel: ${dvAccel[0]}, ${dvAccel[1]}, ${dvAccel[2]}, Gyro: ${dvGyro[0]}, ${dvGyro[1]}, ${dvGyro[2]}`);
  } 
  closeFd();
}


// ===================================================
// SEND FILE TO COMPANION
// ===================================================
// Setup a loop similar to readFile() above to send file in chunks
function sendFile(fn){
  numRowsSent = 0;

  let stats = fs.statSync(fn);    // Get file size so we can chunk it
  if (stats) {
    numRowsTotal = stats.size/BYTES_PER_ROW;
    if (DEBUG) console.log(`total num rows = ${numRowsTotal} (${stats.size/1024}kb)`);
  }
  
  // open file and send header row
  fileID = fs.openSync(fn, "r");
  fs.readSync(fileID, buffer, 0, BYTES_PER_ROW, 0);
  if (DEBUG) console.log(`Row 1 : Gender: ${dvGender[0]}, RestingHR: ${dvHR[0]}, Time: ${dvTime[0]}`);
  if (messaging.peerSocket.readyState === messaging.peerSocket.OPEN) {
    if (DEBUG) console.log(`ionic:sending - Row 1 : Time: ${dvTime[0]}, Gender: ${dvGender[0]}, RestingHR: ${dvHR[0]}`);
    messaging.peerSocket.send(`${dvTime[0]},${dvGender[0]},${dvHR[0]}`);
    numRowsSent++;
  }
  
  // console.log('continueSendingData from sendFile');
  continueSendingData();
}

//Listen for the onbufferedamountdecrease event
messaging.peerSocket.onbufferedamountdecrease = function() {
  // console.log(`ionic: onbufferedamountdecrease - state=${btnState}`);
  
  if ( btnState == 'sending' ) {
    // console.log('continueSendingData from onbufferedamountdecrease');
    continueSendingData();
  }
}

function continueSendingData() {
  if ( btnState !== 'sending' ) return;
  
  if (DEBUG) console.log(`continueSendingData: bufferedAmount=${messaging.peerSocket.bufferedAmount}`);
  
  // Send data only while the buffer contains less than 128 bytes
  while (messaging.peerSocket.bufferedAmount < 128) {
    btnRecord.text = `Sending ${((numRowsSent/numRowsTotal) * 100).toFixed(2)}%`;
    fileID = fs.openSync(recFilename, "r");
    fs.readSync(fileID, buffer, 0, BYTES_PER_ROW, numRowsSent*BYTES_PER_ROW);
    messaging.peerSocket.send(`${dvTime[0]},${dvHR[0]},${dvAccel[0]},${dvAccel[1]},${dvAccel[2]},${dvGyro[0]},${dvGyro[1]},${dvGyro[2]}`);
    numRowsSent++;
    if (DEBUG) console.log(`sending - Row ${numRowsSent} : Time: ${dvTime[0]}, HR:${dvHR[0]}, Accel: ${dvAccel[0]}, ${dvAccel[1]}, ${dvAccel[2]}, Gyro: ${dvGyro[0]}, ${dvGyro[1]}, ${dvGyro[2]}`);

    closeFd();
  }
  
  if ( numRowsSent >= numRowsTotal ){
    if (DEBUG) console.log('FINISHED SENDING - Setting btnState to start in continueSendingData');
    btnState = 'start';             // We are in a ready to START state
    btnRecord.text = 'Record';      // Change button to "Record"
  }
}
// ===================================================

function getFileID() {
  if (fileID === null) {
    fileID = fs.openSync(recFilename, 'a');
  }
  
  return fileID;
}