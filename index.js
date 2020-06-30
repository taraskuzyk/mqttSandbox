var mqtt = require("mqtt")
var decode = require("./uplink_ble_tracker")
const mqttClient = mqtt.connect("https://lorawan-ns-eu.tektelic.com",
    {"username": "contact", "password": "please work"});

//const sensors = ["647FDA00000059BE", "647FDA000000596D", "647FDA00000059B3"]
const sensors = ["647FDA000000589A", "647FDA00000058AE", "647FDA000000597F", "647FDA0000005974", "647FDA0000005892"]
const commands = {
    "setupall": [
        {port: "100", base64: "kQAAkgUAoAAAAAelAAHQvNEDA9IB9NMAltQUtFcAAAD////VAAAAAAAAAAAA2IDwYAA="}
        // {port: "100", base64: "kQAAkgUAoAAAAAelAAHQvNEEBNIB9NMB9NQUtFcAAAD////VAAAAAAAAAAAA2IDwYAA="}
        // {port: "100", base64: "kQAAkgUAoAAAAAelAAHQvNEEBNIACtMACtQUtFcAAAD////VAAAAAAAAAAAA2IDwYAA="}
    ],
    "setup": [
        // {port: "100", base64: "kQAA"}, // Duty Cycle/ADR: Both disabled
        // {port: "100", base64: "kgUA"}, // Default DR Number: = DR5
        // {port: "100", base64: "oAAAAAc="}, // Seconds per Core Tick: = 7 s
        // {port: "100", base64: "pQAB"}, // Ticks per BLE: = 1
        // {port: "100", base64: "0Lw="}, // Mode: Number of Reported devices = 60, Repetition  on
        // {port: "100", base64: "0QMD"}, // Scan Duration: Periodic Reports (and Event-Based Reports) = 3 s
        // {port: "100", base64: "0gH0"}, // Scan Interval: = 500 ms
        // {port: "100", base64: "0wCW"}, // Scan Window: = 150 ms
        // {port: "100", base64: "1BS0VwAAAP///w=="}, // BLE Address Range 0: 14B457xxxxxx
        {port: "100", base64: "0QMD0gH00wCW1BS0VwAAAP///9UAAAAAAAAAAAA="}, // scan duration 3, interval 500, window 150

        // {port: "100", base64: "1QAAAAAAAAAAAA=="}, // BLE Address Range 1: empty
        // {port: "100", base64: "2IA="}, // Advertising: On
        // {port: "100", base64: "8GAA"}, // Save App+LoRa Config to Flash:
        // {port: "100", base64: "oQAA"} // Disable battery report
        // {port: "100", base64: "oQAA"} // Read advertising
    ],
    "read": [
        // {port: "100", base64: "ERIgJVBRUlNUVVg="} // read everything
        {port: "100", base64: "WA=="} // read advertising

    ]
}

mqttClient.subscribe("app/#")
    .on("message", (topic, raw) => {
        var receivedObject = JSON.parse(String.fromCharCode.apply(null, new Uint8Array(raw)));

        receivedObject.serverTimestamp = Date.now()
        if (receivedObject.hasOwnProperty("payloadMetaData")
             && receivedObject.payloadMetaData.deviceMetaData.deviceEUI === "647FDA000000589A"
            // || receivedObject.payloadMetaData.deviceMetaData.deviceEUI === "647FDA000000589A"
        ) {
            var uplink = {
                "payload": receivedObject.payload,
                //"bytes": Base64Binary.decode(receivedObject.payload),
                "port": receivedObject.payloadMetaData.fport,
                "deveui": receivedObject.payloadMetaData.deviceMetaData.deviceEUI,
                "name": receivedObject.payloadMetaData.deviceMetaData.name
            };
            uplink.decoded = decode(uplink.payload, uplink.port)
            console.log(uplink)
        }
    })

sensors.forEach(sensor=>{
   commands.setup.forEach(cmd => {
       let msg = "{\"msgId\":\"1\", \"devEUI\":\"" + sensor + "\", \"port\":" +
           cmd.port + ", \"confirmed\": false, \"data\": \"" + cmd.base64 + "\"}"
       console.log(msg)
       mqttClient.publish("app/tx", msg)
   })
})

var Base64Binary = {
    _keyStr : "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",

    /* will return a  Uint8Array type */
    decodeArrayBuffer: function(input) {
        const bytes = (input.length / 4) * 3;
        const ab = new ArrayBuffer(bytes);
        this.decode(input, ab);

        return ab;
    },

    removePaddingChars: function(input){
        const lkey = this._keyStr.indexOf(input[input.length - 1]);
        if(lkey === 64){
            return input.substring(0,input.length - 1);
        }
        return input;
    },

    decode: function (input, arrayBuffer) {
        //get last chars to see if are valid
        input = this.removePaddingChars(input);
        input = this.removePaddingChars(input);

        const bytes = parseInt((input.length / 4) * 3, 10);

        let uarray;
        let chr1, chr2, chr3;
        let enc1, enc2, enc3, enc4;
        let i = 0;
        let j = 0;

        if (arrayBuffer)
            uarray = new Uint8Array(arrayBuffer);
        else
            uarray = new Uint8Array(bytes);

        //input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");

        for (i=0; i<bytes; i+=3) {
            //get the 3 octets in 4 ascii chars
            enc1 = this._keyStr.indexOf(input[j++]);
            enc2 = this._keyStr.indexOf(input[j++]);
            enc3 = this._keyStr.indexOf(input[j++]);
            enc4 = this._keyStr.indexOf(input[j++]);

            chr1 = (enc1 << 2) | (enc2 >> 4);
            chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
            chr3 = ((enc3 & 3) << 6) | enc4;

            uarray[i] = chr1;
            if (enc3 !== 64) uarray[i+1] = chr2;
            if (enc4 !== 64) uarray[i+2] = chr3;
        }

        return uarray;
    }
};

