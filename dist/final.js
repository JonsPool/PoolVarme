// Spotelly Version 3.6
// This script uses EPEX spot energy prices to control the power output of a Shelly device.
// See https://github.com/towiat/spotelly for the full documentation.
// This script uses price data from http://energy-charts.info

// <<<<< START OF CONFIGURATION - change values below to your preference >>>>>

let epexBZN = "AT"; // EPEX Bidding Zone - see documentation for valid codes

let hourMode = true; // true for hourly, false for quarter-hourly calculation
let blockMode = false; // set calculation mode. True for a consequative duration, false to allow for several, spread out durations

let switchOnDuration = 4; // hours if hourMode is true, else quarter hours
let timeWindowStartHour = 7; // minimum 0, maximum 23
let timeWindowEndHour = 19; // minimum 0, maximum 23
let priceLimit = Infinity; // in SEK/kWh
let useFallback = true; // if true, use fallback when price retrieval fails

// change this function to display prices according to the conditions of your contract
function priceModifier(datetime, spotPrice) {
  return spotPrice; // spotPrice is in SEK/kWh
}

let switchID = 0; // set the switch ID for multi-switch devices
let invertSwitch = false; // if true, switch will be OFF for cheapest hours and ON for the rest

let telegramActive = false; // set to true to activate the Telegram feature. This feature provides messages when the price table was updated and whenever power was turned ON/OFF

// the following settings have no effect when telegramActive is false
let telegramToken = ""; // must be set when telegramActive is true
let telegramChatID = ""; // must be set when telegramActive is true
let deviceName = "Shelly"; // will be included in telegrams to identify the sender
let sendSchedule = true; // send telegram with schedule and price details after each run
let sendPowerOn = true; // send telegram when power has been switched on by this script
let sendPowerOff = true; // send telegram when power has been switched off by this script

// <<<<< END OF CONFIGURATION - no changes needed below this line >>>>>

let prc = [];
let on = [];
let anch = 0;
let rOff = Math.ceil(Math.random() * 300000);
let timH = undefined;
let html = atob("H4sIAAAAAAAACn1UbW/bNhD+KxzhFuRM0Xa7DIMtKntL121tWiAZhmEYEJo8h2woUhDPdgLF/32gYjf9MOwLybt7KJ6ee+7qr2wy+NABcdiGpi4rsRp1tc4VOmhBWd3fNXULqEnULaidh32XeiQmRYSIiu69Racs7LyBajSEjx69DlU2OoBa0KYOPt4R18NGOcQuL2czY6P8lC0Ev+tlBJzFrp2tU8KMve6+P5Ov5Xcz6zPOTM7PAdn6KE3OpIegMj4EyA4Amxo9BmiuuoQQwkM9e7LrdbIPxASds6K22gS4J2WpTArbNhKEe6wMRISeNnWrfTyBR9Rtn/bVgrRYvSbtujqjTY16HeAEejLGtVqn3kIP9mhm7H0HluwrvcVE2vtxLx9woC3xVrmmxjE9b9W6qWfjvaaelSyaepMSQn96aH1bdb1vdf9ANv4ebLVOiKml5e6mqbPpfYdNACRbtffRpr0MyWj0KcpCu+yhC9oAo/nIEBW0VJpyYRRDAVw1NpltCxHlLeBFgHL88eFXy5BLHyP0b6/fv1MgvELVRNiTnzVCCWJ6l0qlr7D38ZbRvKNisBrhqtRnSbNLPVKBvj15WrB+29IDF61yqhkMo46Kmxr7wg8xKeROR/VN8zGlQN6CRh9vybUvOiyMTwYn8+EIb0oeZX+btn3Zry5+n9396crxQ7zhq0JLVHOR1VxYRenKb5iTmg8lYJSTWiTFnOyUk51sdcdQNXh+fqkvuXiv0clW3zMppZMd5yKoJ5+PJ9+q3Nuk/kIbx45kDjvdE1BOpr/hH6EVg5cvWZ4qFHE65cLnS33JEj+nc0HmLwRZzOcv6HLxav41W1QMq8BnLFWB8yl9CgpyNn9BudDqZtS9oiaF1C+Jy4FNBn3gK3qzslN1pNGS4mwmg2eGyxy8ATYXizk//HdssRCLb5+DR+WNDQLRNpMBJaY3RXzs1Qhraut3R9gm9W2V9x6Na2ofuy1+GTAOzF315C7jRo2OdbonkwHO6WiBpUtKDyTFn4I3d4oimwzmIAg6n+URwmlTz6zfNTfCTJWT/sAPhtE1FfbxkZ7++7N8jjl01VlzmciT3FelLqhO+hWonIyPj896Lup/sw3hL9A942K036eI7mSMMD5li7NajY6iu8w4F4szXuyiU8anTvYrw+iGipvJEA8kQwCDYAX5YQe9voUlmQwsnudZXM75l+SSk4LXfXMJ90j+6Eo7LcnN1DPk/CDw1LPDBtA4thV4PrSALtkl/fjh6pqKMlqWv119uJR57Eu/eWCDW6JISzjww/Iz/JeLa3rgEh3EUfjyU06R8WdPW96URpeHUDVPhP8v23RaslwdJ1GKIWmrsJ4d59S/M0l/DngGAAA="); // placeholder for compressed endpoint.html
let intv = hourMode ? 3_600_000 : 900_000;

function next() {
  let info = Timer.getInfo(timH);
  if (info === undefined) return 0;
  return Math.floor(Date.now()) + info.next - Shelly.getUptimeMs();
}

function log(msg, sendTelegram) {
  console.log(msg);
  if (telegramActive && sendTelegram) {
    Shelly.call("http.post", {
      url: "https://api.telegram.org/bot" + telegramToken + "/sendMessage",
      content_type: "application/json",
      body: { chat_id: telegramChatID, text: deviceName + ": " + msg },
    });
  }
}

function set(val) {
  if (invertSwitch) val = !val;
  if (Shelly.getComponentStatus("switch", switchID).output === val) return;
  let msg = val ? "ON." : "OFF.";
  let flag = val ? sendPowerOn : sendPowerOff;
  Shelly.call("Switch.Set", { id: switchID, on: val }, function (res, errc) {
    if (errc === 0) {
      log("Switch " + switchID + " has been turned " + msg, flag);
    } else {
      log("ERROR: Switch " + switchID + " could not be turned " + msg, flag);
    }
  });
}

function getP() {
  let now = new Date();                                                           // H�mta dagens datum
  let strt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  let year = strt.getFullYear().toString();
  let month = (strt.getMonth() + 1).toString();
  //  let month = (strt.getMonth() + 1).toString().padStart(2, "0");  // ChatGTP
  let day = strt.getDate().toString();
  //  let day = strt.getDate().toString().padStart(2, "0");           // ChatGTP
  let parm = [
    year,
    //  "-",
     "/",                                                                     // My url change 1.
    month.length === 1 ? "0" + month : month,
    "-",
    day.length === 1 ? "0" + day : day,
    ].join("");
  //  let parm = `${year}/${month}-${day}`;           // ChatGTP
    console.log(parm);
    //let url = "https://api.energy-charts.info/price?bzn=" + epexBZN + "&start=" + parm;                      // url f�r pris p� tysk-�sterikisk marknad
  let url = "https://se.elpris.eu/api/v1/prices/" + parm + "_SE3.json";                                // url change 2. url  f�r spotpris. L�gg till ?avg24 f�r timpris, men d� blir det nog fel nedan.
  //  let url = `https://se.elpris.eu/api/v1/prices/${parm}_SE3.json`;   // ChatGTP
   // console.log("getP");
  //  const response = await fetch(url);             // ChatGTP
  //  const data = await response.json();            // ChatGTP
  //  console.log(data);                             // ChatGTP
    Shelly.call("http.get", { url: url }, prcP, strt.getTime());

}
getP();                            // ChatGTP - No difference

function prcP(res, errc, errm, strt) {
    console.log("Inne i prcP");
  let fbm = false;
  let dsix = prc.length;
  let mult = hourMode ? 1 : 4;
  let dt = strt;                                           // Varf�r skapas dt som en kopia av aktuellt datum? Jo, f�r att g� fr�n 15 minuters pris till timpris om hourMode=true!

  let err = "";
  if (errc !== 0) {
      err = "Shelly error: " + errc + "/" + errm;
      console.log("1");
  } else if (res.code !== 200) {
      err = "Server error " + res.code + "/" + res.message;
      console.log("2");
  } else {
     delete res.headers; // free up RAM to reduce peak memory usage
      // let pstr = res.body.indexOf('"price":') + 8;
    // let pend = res.body.indexOf("]", pstr) + 1;           // last position
    //res.body = res.body.substring(pstr, pend);            // prisstr�ng
     // let prcs = JSON.parse(res.body);                      // priser
     let prcs = JSON.parse(res.body).p;                    // From Towiat 2026-02-27
     console.log("3");
     delete res.body;
    if (hourMode) {                                            
      for (let i = 0; i < prcs.length; i += 4) {
        let psum = 0;
        for (let j = i; j < i + 4; j++) psum += prcs[j];
        prc.push(priceModifier(new Date(dt), parseFloat((psum / 4).toFixed(3))));
        dt += intv;
      }
    } else {
      for (let p of prcs) {                                       // Vad g�rs h�r?
        prc.push(priceModifier(new Date(dt), p));
        dt += intv;
      }
    }
  }

  if (err) {
    if (strt > Date.now() + 1800000) {
      // retry only if day starts at least 30 minutes in the future
      timH = Timer.set(1200000, false, getP);
      console.log(err, "Trying again at", next());
      return;
    }

    if (!useFallback) return;

    // no prices retrieved and useFallback is true - do the fallback
    fbm = true;
    for (let p of [
      7.56, 6.98, 6.73, 6.53, 6.63, 7.33, 8.97, 10.16, 9.74, 8.21, 6.87, 6.0, 5.35, 5.02, 5.28,
      6.38, 7.85, 9.75, 11.16, 12.1, 11.58, 10.02, 9.01, 7.97,
    ])
      for (let i = 0; i < mult; i++) {
        prc.push(priceModifier(new Date(dt), p)); // if not in hourMode, push each price 4 times
        dt += intv;
      }
  }

  if (anch === 0) anch = strt;

  let wsix = dsix + timeWindowStartHour * mult;
  let weix = timeWindowEndHour ? prc.length - (24 * mult - timeWindowEndHour * mult) : prc.length;
  let dur = Math.min(switchOnDuration, weix - wsix);

  if (blockMode) {
    let sidx = 0;
    let lSum = Infinity;
    for (let i = wsix, j = wsix + dur; j < weix; i++, j++) {
      let sSum = 0;
      for (let h = i; h < j; h++) sSum += prc[h];
      if (sSum < lSum) {
        sidx = i;
        lSum = sSum;
      }
    }
    for (let i = sidx; i < sidx + dur; i++) on[i] = true;
  } else {
    for (let i = 0; i < dur; i++) {
      let midx;
      let mprc = Infinity;
      for (let j = wsix; j < weix; j++) {
        if (prc[j] < mprc && !on[j]) {
          midx = j;
          mprc = prc[j];
        }
      }
      on[midx] = true;
    }
  }

  for (let i = dsix; i < prc.length; i++) {
    if (fbm) prc[i] = NaN;
    if (!fbm && prc[i] >= priceLimit) delete on[i];
  }

  log("Timetable has been updated.", sendSchedule);
}

// eslint-disable-next-line no-unused-vars
function chck() {
  let now = Math.floor(Date.now());
  let time = new Date(now - (now % intv));
  if (time.getTime() === anch) {
    prc.splice(0, 1)[0];
    set(Boolean(on.splice(0, 1)[0]));
    anch = prc.length === 0 ? 0 : anch + intv;
  }

  if (time.getHours() === 15 && time.getMinutes() === 0) timH = Timer.set(rOff, false, getP);
}

function spEP(req, res) {                                                          // Spotpris-rutin
  res.headers = [
    ["Content-Type", "text/html"],
    ["Content-Encoding", "gzip"],
  ];
  res.body = html;
  res.send();
}

function dtEP(req, res) {                                                           // Backup data-rutin, om ej giltig prisdata hittas
  if (req.method === "POST") {
    let data = JSON.parse(req.body);
    let idx = (data.h - anch) / intv;
    if (idx >= 0 && idx < prc.length) data.o ? (on[idx] = true) : delete on[idx];
  }
  res.headers = [["Content-Type", "application/json"]];
  res.body = JSON.stringify({ i: intv, a: anch, n: next(), s: switchID, p: prc, o: on, r: rOff });
  res.code = 200;
  res.send();
}

function init() {
  if (Shelly.getComponentStatus("sys").unixtime === null) {
    console.log("Time not synchronized, waiting one second...");
    Timer.set(1000, false, init);
    return;
  }

  //if (new Date().getHours() >= 15) timH = Timer.set(0, false, getP);                  // H�mta nya priser efter kl. 15
    timH = Timer.set(0, false, getP);               // Test

  HTTPServer.registerEndpoint("spotelly", spEP);
  HTTPServer.registerEndpoint("data", dtEP);
    console.log("Init");
  Shelly.call("Schedule.List", {}, function (res) {
    let call = { method: "Script.Eval", params: { id: Script.id, code: "chck()" } };
    let schd = {
      enable: true,
      timespec: hourMode ? "0 0 * * * *" : "0 */15 * * * *",
      calls: [call],
    };

    for (let job of res.jobs) {
      let cll = job.calls[0];
      if (cll.method.toLowerCase() !== "script.eval" || cll.params.id !== Script.id) continue;
      if (job.timespec === schd.timespec && cll.params.code === call.params.code) return;
      schd.id = job.id;
      break;
    }

    Shelly.call("id" in schd ? "Schedule.Update" : "Schedule.Create", schd);
  });
}

init();
