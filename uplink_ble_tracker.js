module.exports = function decode(payload, port){
    var bytes = Base64Binary.decode(payload);

    function slice(a, f, t) {
        var res = [];
        for (var i = 0; i < t - f; i++) {
            res[i] = a[f + i];
        }
        return res;
    }

    function extract_bytes(chunk, start_bit, end_bit) {
        var total_bits = end_bit - start_bit + 1;
        var total_bytes = total_bits % 8 === 0 ? to_uint(total_bits / 8) : to_uint(total_bits / 8) + 1;
        var offset_in_byte = start_bit % 8;
        var end_bit_chunk = total_bits % 8;

        var arr = new Array(total_bytes);


        for (byte = 0; byte < total_bytes; ++byte) {
            var chunk_idx = to_uint(start_bit / 8) + byte;
            var lo = chunk[chunk_idx] >> offset_in_byte;
            var hi = 0;
            if (byte < total_bytes - 1) {
                hi = (chunk[chunk_idx + 1] & ((1 << offset_in_byte) - 1)) << (8 - offset_in_byte);
            } else if (end_bit_chunk !== 0) {
                // Truncate last bits
                lo = lo & ((1 << end_bit_chunk) - 1);
            }

            arr[byte] = hi | lo;
        }

        return arr;
    }

    function apply_data_type(bytes, data_type) {
        output = 0;
        if (data_type === "unsigned") {
            for (var i = 0; i < bytes.length; ++i) {
                output = (to_uint(output << 8)) | bytes[i];
            }

            return output;
        }

        if (data_type === "signed") {
            for (var i = 0; i < bytes.length; ++i) {
                output = (output << 8) | bytes[i];
            }

            // Convert to signed, based on value size
            if (output > Math.pow(2, 8 * bytes.length - 1)) {
                output -= Math.pow(2, 8 * bytes.length);
            }


            return output;
        }

        if (data_type === "bool") {
            return !(bytes[0] === 0);
        }

        if (data_type === "hexstring") {
            return toHexString(bytes);
        }

        // Incorrect data type
        return null;
    }

    function decode_field(chunk, start_bit, end_bit, data_type) {
        chunk_size = chunk.length;
        if (end_bit >= chunk_size * 8) {
            return null; // Error: exceeding boundaries of the chunk
        }

        if (end_bit < start_bit) {
            return null; // Error: invalid input
        }

        arr = extract_bytes(chunk, start_bit, end_bit);
        return apply_data_type(arr, data_type);
    }

    decoded_data = {};
    decoder = [];


    if (port === 10) {
        decoder = [
            {
                key: [0x00, 0xBA],
                fn: function (arg) {
                    // Battery-1 status
                    battery_status = {life: null, eos_alert: null};
                    battery_status.life = 2.5 + decode_field(arg, 0, 6, "unsigned") * 0.01;
                    battery_status.eos_alert = decode_field(arg, 7, 7, "unsigned");
                    decoded_data.battery_status = JSON.stringify(battery_status);
                    return 1;
                }
            },
            {
                key: [0x00, 0x04],
                fn: function (arg) {
                    // FSM state
                    decoded_data.fsm_state = decode_field(arg, 0, 7, "unsigned");
                    return 1;
                }
            },
            {
                key: [0x00, 0x67],
                fn: function (arg) {
                    // MCU Temperature
                    decoded_data.mcu_temperature = decode_field(arg, 0, 15, "signed") * 0.1;
                    return 2;
                }
            },
            {
                key: [0x00, 0x00],
                fn: function (arg) {
                    // Acceleration Alarm Status
                    decoded_data.acceleration_alarm = decode_field(arg, 0, 7, "unsigned");
                    return 1;
                }
            },
            {
                key: [0x00, 0x71],
                fn: function (arg) {
                    // Acceleration
                    acceleration = {xaxis: null, yaxis: null, zaxis: null};
                    acceleration.xaxis = decode_field(arg, 0, 15, "signed") * 0.001;
                    acceleration.yaxis = decode_field(arg, 16, 31, "signed") * 0.001;
                    acceleration.zaxis = decode_field(arg, 32, 47, "signed") * 0.001;
                    decoded_data.acceleration = JSON.stringify(acceleration);
                    return 6;
                }
            },
        ]
    }
    if (port === 100) {
        decoder = [
            {
                key: [0x00],
                fn: function (arg) {
                    // DevEUI
                    decoded_data.device_eui = decode_field(arg, 0, 63, "hexstring");
                    return 8;
                }
            },
            {
                key: [0x01],
                fn: function (arg) {
                    // AppEUI
                    decoded_data.app_eui = decode_field(arg, 0, 63, "hexstring");
                    return 8;
                }
            },
            {
                key: [0x02],
                fn: function (arg) {
                    // AppKey
                    decoded_data.app_key = decode_field(arg, 0, 127, "hexstring");
                    return 16;
                }
            },
            {
                key: [0x03],
                fn: function (arg) {
                    // DevAddr
                    decoded_data.device_address = decode_field(arg, 0, 31, "hexstring");
                    return 4;
                }
            },
            {
                key: [0x04],
                fn: function (arg) {
                    // NwkSKey
                    decoded_data.network_session_key = decode_field(arg, 0, 127, "hexstring");
                    return 16;
                }
            },
            {
                key: [0x05],
                fn: function (arg) {
                    // AppSKey
                    decoded_data.app_session_key = decode_field(arg, 0, 127, "hexstring");
                    return 16;
                }
            },
            {
                key: [0x10],
                fn: function (arg) {
                    // Join mode
                    decoded_data.loramac_join_mode = decode_field(arg, 7, 7, "unsigned");
                    return 2;
                }
            },
            {
                key: [0x11],
                fn: function (arg) {
                    // loramac_opts
                    loramac_opts = {confirm_mode: null, sync_word: null, duty_cycle: null, adr: null};
                    decoded_data.loramac_opts = loramac_opts;
                    decoded_data.loramac_opts.confirm_mode = decode_field(arg, 8, 8, "unsigned");
                    decoded_data.loramac_opts.sync_word = decode_field(arg, 9, 9, "unsigned");
                    decoded_data.loramac_opts.duty_cycle = decode_field(arg, 10, 10, "unsigned");
                    decoded_data.loramac_opts.adr = decode_field(arg, 11, 11, "unsigned");
                    return 2;
                }
            },
            {
                key: [0x12],
                fn: function (arg) {
                    // loramac_dr_tx
                    loramac_dr_tx = {dr_number: null, tx_power_number: null};
                    decoded_data.loramac_dr_tx = loramac_dr_tx;
                    decoded_data.loramac_dr_tx.dr_number = decode_field(arg, 0, 3, "unsigned");
                    decoded_data.loramac_dr_tx.tx_power_number = decode_field(arg, 8, 11, "unsigned");
                    return 2;
                }
            },
            {
                key: [0x13],
                fn: function (arg) {
                    // loramac_rx2
                    loramac_rx2 = {frequency: null, dr_number: null};
                    decoded_data.loramac_rx2 = loramac_rx2;
                    decoded_data.loramac_rx2.frequency = decode_field(arg, 0, 31, "unsigned");
                    decoded_data.loramac_rx2.dr_number = decode_field(arg, 32, 39, "unsigned");
                    return 5;
                }
            },
            {
                key: [0x20],
                fn: function (arg) {
                    // Core tick in seconds for periodic events
                    decoded_data.seconds_per_core_tick = decode_field(arg, 0, 31, "unsigned");
                    return 4;
                }
            },
            {
                key: [0x21],
                fn: function (arg) {
                    // Ticks between Battery reports
                    decoded_data.tick_per_battery = decode_field(arg, 0, 15, "unsigned");
                    return 2;
                }
            },
            {
                key: [0x24],
                fn: function (arg) {
                    // Ticks per Accelerometer
                    decoded_data.tick_per_accelerometer = decode_field(arg, 0, 15, "unsigned");
                    return 2;
                }
            },
            {
                key: [0x25],
                fn: function (arg) {
                    // Ticks per BLE - default
                    decoded_data.tick_per_ble_default = decode_field(arg, 0, 15, "unsigned");
                    return 2;
                }
            },
            {
                key: [0x26],
                fn: function (arg) {
                    // Ticks per BLE - stillness
                    decoded_data.tick_per_ble_stillness = decode_field(arg, 0, 15, "unsigned");
                    return 2;
                }
            },
            {
                key: [0x27],
                fn: function (arg) {
                    // Ticks per BLE - mobility
                    decoded_data.tick_per_ble_mobility = decode_field(arg, 0, 15, "unsigned");
                    return 2;
                }
            },
            {
                key: [0x28],
                fn: function (arg) {
                    // Ticks per temperature
                    decoded_data.tick_per_temperature = decode_field(arg, 0, 15, "unsigned");
                    return 2;
                }
            },
            {
                key: [0x2A],
                fn: function (arg) {
                    // Mode
                    mode = {
                        reed_event_type: null,
                        battery_voltage_report: null,
                        acceleration_vector_report: null,
                        temperature_report: null,
                        ble_report: null
                    };
                    decoded_data.mode = mode;
                    decoded_data.mode.reed_event_type = decode_field(arg, 7, 7, "unsigned");
                    decoded_data.mode.battery_voltage_report = decode_field(arg, 8, 8, "unsigned");
                    decoded_data.mode.acceleration_vector_report = decode_field(arg, 9, 9, "unsigned");
                    decoded_data.mode.temperature_report = decode_field(arg, 10, 10, "unsigned");
                    decoded_data.mode.ble_report = decode_field(arg, 11, 11, "unsigned")
                    return 2;
                }
            },
            {
                key: [0x2B],
                fn: function (arg) {
                    // Event type 1
                    event_type1 = {m_value: null, n_value: null};
                    decoded_data.event_type1 = event_type1;
                    decoded_data.event_type1.m_value = decode_field(arg, 0, 3, "unsigned");
                    decoded_data.event_type1.n_value = decode_field(arg, 4, 7, "unsigned");
                    return 1;
                }
            },
            {
                key: [0x2C],
                fn: function (arg) {
                    // Event type 2
                    event_type2 = {t_value: null};
                    decoded_data.event_type2 = event_type2;
                    decoded_data.event_type2.t_value = decode_field(arg, 0, 3, "unsigned");
                    return 1;
                }
            },
            {
                key: [0x40],
                fn: function (arg) {
                    // Accelerometer
                    accelerometer = {xaxis_enabled: null, yaxis_enabled: null, zaxis_enabled: null};
                    decoded_data.accelerometer = accelerometer;
                    decoded_data.accelerometer.xaxis_enabled = decode_field(arg, 0, 0, "unsigned");
                    decoded_data.accelerometer.yaxis_enabled = decode_field(arg, 1, 1, "unsigned");
                    decoded_data.accelerometer.zaxis_enabled = decode_field(arg, 2, 2, "unsigned");
                    return 1;
                }
            },
            {
                key: [0x41],
                fn: function (arg) {
                    // Sensitivity
                    sensitivity = {accelerometer_sample_rate: null, accelerometer_measurement_range: null};
                    decoded_data.sensitivity = sensitivity;
                    decoded_data.sensitivity.accelerometer_sample_rate = decode_field(arg, 0, 2, "unsigned") * 1;
                    switch (decoded_data.sensitivity.accelerometer_sample_rate) {

                        case 1:
                            decoded_data.sensitivity.accelerometer_sample_rate = 1;
                            break;

                        case 2:
                            decoded_data.sensitivity.accelerometer_sample_rate = 10;
                            break;

                        case 3:
                            decoded_data.sensitivity.accelerometer_sample_rate = 25;
                            break;

                        case 4:
                            decoded_data.sensitivity.accelerometer_sample_rate = 50;
                            break;

                        case 5:
                            decoded_data.sensitivity.accelerometer_sample_rate = 100;
                            break;


                        case 6:
                            decoded_data.sensitivity.accelerometer_sample_rate = 200;
                            break;


                        case 7:
                            decoded_data.sensitivity.accelerometer_sample_rate = 400;
                            break;


                        default: // invalid value
                            decoded_data.sensitivity.accelerometer_sample_rate = 0;
                            break;


                    }

                    decoded_data.sensitivity.accelerometer_measurement_range = decode_field(arg, 4, 5, "unsigned") * 1;
                    switch (decoded_data.sensitivity.accelerometer_measurement_range) {

                        case 0:
                            decoded_data.sensitivity.accelerometer_measurement_range = 2;
                            break;

                        case 1:
                            decoded_data.sensitivity.accelerometer_measurement_range = 4;
                            break;

                        case 2:
                            decoded_data.sensitivity.accelerometer_measurement_range = 8;
                            break;

                        case 3:
                            decoded_data.sensitivity.accelerometer_measurement_range = 16;
                            break;

                        default:
                            decoded_data.sensitivity.accelerometer_measurement_range = 0;
                    }


                    return 1;
                }
            },
            {
                key: [0x42],
                fn: function (arg) {
                    // Acceleration alarm threshold count
                    decoded_data.acceleration_alarm_threshold_count = decode_field(arg, 0, 15, "unsigned");
                    return 2;
                }
            },
            {
                key: [0x43],
                fn: function (arg) {
                    // Acceleration alarm threhsold period
                    decoded_data.acceleration_alarm_threshold_period = decode_field(arg, 0, 15, "unsigned");
                    return 2;
                }
            },
            {
                key: [0x44],
                fn: function (arg) {
                    // Acceleration alarm threhsold
                    decoded_data.acceleration_alarm_threshold = decode_field(arg, 0, 15, "unsigned") * 0.001;
                    return 2;
                }
            },
            {
                key: [0x45],
                fn: function (arg) {
                    // Acceleration alarm grace period
                    decoded_data.acceleration_alarm_grace_period = decode_field(arg, 0, 15, "unsigned");
                    return 2;
                }
            },
            {
                key: [0x46],
                fn: function (arg) {
                    // Accelerometer tx
                    accelerometer_tx = {report_periodic_enabled: null, report_alarm_enabled: null};
                    decoded_data.accelerometer_tx = accelerometer_tx;
                    decoded_data.accelerometer_tx.report_periodic_enabled = decode_field(arg, 0, 0, "unsigned");
                    decoded_data.accelerometer_tx.report_alarm_enabled = decode_field(arg, 1, 1, "unsigned");
                    return 1;
                }
            },
            {
                key: [0x50],
                fn: function (arg) {
                    // BLE mode
                    // decoded_data.ble_mode = {}
                    decoded_data.ble_mode_repeat = decode_field(arg, 7, 7, "unsigned");
                    decoded_data.ble_mode_number_of_reported_devices = decode_field(arg, 0, 6, "unsigned")
                    return 1;
                }
            },
            {
                key: [0x51],
                fn: function (arg) {
                    // BLE scan interval
                    decoded_data.ble_scan_interval = decode_field(arg, 0, 15, "unsigned") * 0.001;
                    return 2;
                }
            },
            {
                key: [0x52],
                fn: function (arg) {
                    // BLE scan window
                    decoded_data.ble_scan_window = decode_field(arg, 0, 15, "unsigned") * 0.001;
                    return 2;
                }
            },
            {
                key: [0x53],
                fn: function (arg) {
                    // BLE scan duration
                    decoded_data.ble_scan_duration = decode_field(arg, 0, 15, "unsigned");
                    return 2;
                }
            },
            {
                key: [0x54],
                fn: function (arg) {
                    // Number of reported devices
                    decoded_data.ble_reported_devices = decode_field(arg, 0, 7, "unsigned");
                    return 1;
                }
            },
            {
                key: [0x60],
                fn: function (arg) {
                    // Temperature sample period idle
                    decoded_data.temperature_sample_period_idle = decode_field(arg, 0, 31, "unsigned");
                    return 4;
                }
            },
            {
                key: [0x61],
                fn: function (arg) {
                    // Temperature sample period idle
                    decoded_data.temperature_sample_period_active = decode_field(arg, 0, 31, "unsigned");
                    return 4;
                }
            },
            {
                key: [0x62],
                fn: function (arg) {
                    // Temperature high and low threshold
                    temperature_threshold = {high: null, low: null};
                    decoded_data.temperature_threshold = temperature_threshold;
                    decoded_data.temperature_threshold.high = decode_field(arg, 0, 7, "unsigned");
                    decoded_data.temperature_threshold.low = decode_field(arg, 8, 15, "unsigned");

                    return 2;
                }
            },
            {
                key: [0x63],
                fn: function (arg) {
                    // Temperature threhold enabled
                    decoded_data.temperature_threshold_enabled = decode_field(arg, 0, 0, "unsigned");
                    return 1;
                }
            },
            {
                key: [0x71],
                fn: function (arg) {
                    //
                    firmware_version = {
                        app_major_version: null,
                        app_minor_version: null,
                        app_revision: null,
                        loramac_major_version: null,
                        loramac_minor_version: null,
                        loramac_revision: null,
                        region: null
                    }
                    decoded_data.firmware_version = firmware_version;
                    decoded_data.firmware_version.app_major_version = decode_field(arg, 0, 7, "unsigned") * 1;
                    decoded_data.firmware_version.app_minor_version = decode_field(arg, 8, 15, "unsigned") * 1;
                    decoded_data.firmware_version.app_revision = decode_field(arg, 16, 23, "unsigned") * 1;
                    decoded_data.firmware_version.loramac_major_version = decode_field(arg, 24, 31, "unsigned") * 1;
                    decoded_data.firmware_version.loramac_minor_version = decode_field(arg, 32, 39, "unsigned") * 1;
                    decoded_data.firmware_version.loramac_revision = decode_field(arg, 40, 47, "unsigned") * 1;
                    decoded_data.firmware_version.region = decode_field(arg, 48, 55, "unsigned") * 1;
                    return 7;
                }
            }
        ]
    }

    if (port === 25) {
        decoded_data.detected_devices = [];
        decoder = [
            {
                key: [0x0A],
                fn: function (arg) {
                    // RSSI to beacons
                    var count = 0;
                    decoded_data.detected_devices = [];
                    for (var i = 0; i < arg.length * 8; i += 7 * 8) {
                        decoded_data.detected_devices.push({
                            "rssi": decode_field(arg, i + 6 * 8, i + 7 * 8 - 1, "signed"),
                            "id": decode_field(arg, i, i + 6 * 8 - 1, "hexstring")
                        });
                        count += 3;
                    }
                    return count;
                }
            },
            {
                key: [0xB0],
                fn: function (arg) {
                    // RSSI to beacons
                    var count = 0;
                    decoded_data.detected_devices_range_0 = [];
                    for (var i = 0; i < arg.length * 8; i += 4 * 8) {
                        decoded_data.detected_devices_range_0.push({
                            "rssi": decode_field(arg, i + 3 * 8, i + 4 * 8 - 1, "signed"),
                            "id": decode_field(arg, i, i + 3 * 8 - 1, "hexstring")
                        });
                        count += 4;
                    }
                    return count;
                }

            },
            {
                key: [0xB1],
                fn: function (arg) {
                    // RSSI to beacons
                    var count = 0;
                    decoded_data.detected_devices_range_1 = [];
                    for (var i = 0; i < arg.length * 8; i += 4 * 8) {
                        decoded_data.detected_devices_range_1.push({
                            "rssi": decode_field(arg, i + 3 * 8, i + 4 * 8 - 1, "signed"),
                            "id": decode_field(arg, i, i + 3 * 8 - 1, "hexstring")
                        });
                        count += 4;
                    }
                    return count;
                }
            },
            {
                key: [0xB2],
                fn: function (arg) {
                    // RSSI to beacons
                    var count = 0;
                    decoded_data.detected_devices_range_2 = [];
                    for (var i = 0; i < arg.length * 8; i += 4 * 8) {
                        decoded_data.detected_devices_range_2.push({
                            "rssi": decode_field(arg, i + 3 * 8, i + 4 * 8 - 1, "signed"),
                            "id": decode_field(arg, i, i + 3 * 8 - 1, "hexstring")
                        });
                        count += 4;
                    }
                    return count;
                }
            },
            {
                key: [0xB3],
                fn: function (arg) {
                    // RSSI to beacons
                    var count = 0;
                    decoded_data.detected_devices_range_3 = [];
                    for (var i = 0; i < arg.length * 8; i += 4 * 8) {
                        decoded_data.detected_devices_range_3.push({
                            "rssi": decode_field(arg, i + 3 * 8, i + 4 * 8 - 1, "signed"),
                            "id": decode_field(arg, i, i + 3 * 8 - 1, "hexstring")
                        });
                        count += 4;
                    }
                    return count;
                }
            },
        ]
    }

    decoded_data['raw'] = JSON.stringify(byteToArray(bytes));
    decoded_data['port'] = port;

    bytes = byteToUArray(bytes)


    for (var bytes_left = bytes.length; bytes_left > 0;) {
        var found = false;
        for (var i = 0; i < decoder.length; i++) {
            var item = decoder[i];
            var key = item.key;
            var keylen = key.length;
            header = slice(bytes, 0, keylen);
            // Header in the data matches to what we expect
            if (is_equal(header, key)) {
                var f = item.fn;
                consumed = f(slice(bytes, keylen, bytes.length)) + keylen;
                bytes_left -= consumed;
                bytes = slice(bytes, consumed, bytes.length);
                found = true;
                break;
            }
        }
        if (found) {
            continue;
        }

        // Unable to decode -- headers are not as expected, send raw payload to the application!
        decoded_data = {};
        decoded_data['raw'] = JSON.stringify(byteToArray(bytes));
        decoded_data['port'] = port;
        decoded_data['unable_to_decode'] = true;
        return decoded_data;
    }


    // Converts value to unsigned
    function to_uint(x) {
        return x >>> 0;
    }

    // Checks if two arrays are equal
    function is_equal(arr1, arr2) {
        if (arr1.length != arr2.length) {
            return false;
        }
        for (var i = 0; i != arr1.length; i++) {
            if (arr1[i] != arr2[i]) {
                return false;
            }
        }
        return true;
    }

    function byteToArray(byteArray) {
        arr = [];
        for (var i = 0; i < byteArray.length; i++) {
            arr.push(byteArray[i]);
        }

        return arr;
    }

    function byteToUArray(byteArray) {
        arr = [];
        for (var i = 0; i < byteArray.length; i++) {
            arr.push(to_uint(byteArray[i]) & 0xff);
        }

        return arr;
    }

    function toHexString(byteArray) {
        var arr = [];
        for (var i = 0; i < byteArray.length; ++i) {
            arr.push(('0' + (byteArray[i] & 0xFF).toString(16)).slice(-2));
        }
        return arr.join('');
    }

    //console.log(decoded_data)
    if (decoded_data.hasOwnProperty('detected_devices'))
        decoded_data.detected_devices = JSON.stringify(decoded_data.detected_devices);
    if (decoded_data.hasOwnProperty('detected_devices_range_0'))
        decoded_data.detected_devices_range_0 = JSON.stringify(decoded_data.detected_devices_range_0);
    if (decoded_data.hasOwnProperty('detected_devices_range_1'))
        decoded_data.detected_devices_range_1 = JSON.stringify(decoded_data.detected_devices_range_1);
    if (decoded_data.hasOwnProperty('detected_devices_range_2'))
        decoded_data.detected_devices_range_2 = JSON.stringify(decoded_data.detected_devices_range_2);
    if (decoded_data.hasOwnProperty('detected_devices_range_3'))
        decoded_data.detected_devices_range_3 = JSON.stringify(decoded_data.detected_devices_range_3);

    return decoded_data;
}

let Base64Binary = {
    _keyStr : "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",

    /* will return a Uint8Array type */
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
