if (!process.env.NODE_ENV) process.env.NODE_ENV = 'production';

var AuthClient = require('crp-auth-client');
var TaskClient = require('crp-task-client');
var TaskProducerClient = require('crp-task-producer-client');

var fs = require('fs');
var LevelUp   = require('levelup');
var LiveStream = require('level-live-stream');

var WebSocketServer = require('ws').Server;
var http = require('http');
var express = require('express');

var db = LevelUp('./crp-benchmark.db');
var app = express();

app.use(express.static(__dirname));

var server = http.createServer(app);
server.listen(8080);

console.log("Point your browser to: localhost:8080");

var wss = new WebSocketServer({server: server});

wss.on('connection', function(ws) {

	var id = setInterval(function() {
		if(isSynced) {
			if(newDataChartOne) {
				ws.send(JSON.stringify(["chartOne", dataChartOne]), function() {});
				newDataChartOne = false;
			}
			else if(newDataChartTwo) {
				ws.send(JSON.stringify(["chartTwo", dataChartTwo]), function() {});
				newDataChartTwo = false;
			}
		}
	}, 1000);
	
	ws.on('close', function() {
		clearInterval(id);
	});

});

//Authentication using your CrowdProcess login information
AuthClient.login('email', 'password', function(err, credential) {
	if (err) throw err;

	createTaskForMaxCalculations(credential);
	//createTaskForMaxSize(credential);
});

var isSynced = false;
var newDataChartOne = false;
var newDataChartTwo = false;

var dataChartOne = {
	"xScale": "ordinal",
	"yScale": "linear",
	"main": [
    {
    	"className": ".chartOne",
    	"data": []
    }
  	]
};

var dataChartTwo = {
	"xScale": "ordinal",
	"yScale": "linear",
	"main": [
    {
    	"className": ".chartTwo",
    	"data": []
    }
  	]
};

var liveStreamForMaxCalculations = LiveStream(db, {tail: true, old: true});

liveStreamForMaxCalculations.on('data', function(data) {

	var key = JSON.parse(data.key);
	var value = parseInt(data.value);

	var dataChart;

	if(key[0] == "chartOne") {
		newDataChartOne = true;
		dataChart = dataChartOne.main[0];
	}
	else if(key[0] == "chartTwo") {
		newDataChartTwo = true;
		dataChart = dataChartTwo.main[0];
	}
	else {
		throw new Error("Wrong dataunit in Database");
	}

	if(dataChart.data.length === 0) dataChart.data.push({"x": key[1], "y": value, "average": 1});
	else {

		for (var i = 0; i < dataChart.data.length; i++) {

			if(dataChart.data[i].x === key[1]) {
				dataChart.data[i].y = (dataChart.data[i].y * dataChart.data[i].average + value) / (dataChart.data[i].average + 1);
				dataChart.data[i].average++;
				break;
			}
			else if(dataChart.data[i].x > key[1]) {
				dataChart.data.splice(i, 0, {"x": key[1], "y": value, "average": 1});
				break;
			}
			else if(i === (dataChart.data.length - 1)) {
				dataChart.data.push({"x": key[1], "y": value, "average": 1});
				break;
			}

		}

	}

});

liveStreamForMaxCalculations.on('sync', function() {

	isSynced = true;

});

function createTaskForMaxCalculations(credential) {

	var taskClient = TaskClient({
    	credential: credential
    });

	//Create CrowdProcess task
	taskClient.tasks.create({
    	bid: 1,
    	program: fs.readFileSync('./lib/program1.js', 'utf8')
    }, afterTaskCreatedForMaxCalculations);

	function afterTaskCreatedForMaxCalculations(err, task) {
	    if (err) throw err;

	    console.log('TaskID Program1: ', task._id);

	    //Create dataunit stream to send dataunits directly to CrowdProcess
	    var stream = TaskProducerClient({
	      credential: credential,
	      taskId: task._id
	    });

	    //Catch faults or errors emited by CrowdProcess
	    stream.on('error', error);
	    stream.on('fault', error);

	    //Counter for sent and received dataunits
	    var sent = 0;
	    var received = 0;

	    var trials = 4;
	    var timeMax = 10;

	    for(var i = 1; i <= timeMax; i++) {
	    	//Run for n-trial times
	    	for(var j = 1; j <= trials; j++) {
	    		//Convert time to ms
	    		stream.write([i * 1000, j]);
	    		sent++;
	    	}
	    }

	    //Receive results from CrowdProcess
	    stream.on('result', function(data) {
	    	data = JSON.parse(data);	
	    	//Save in DB
			db.put(JSON.stringify(["chartOne", (data[0] / 1000), data[1]]), JSON.stringify(data[2]));
			received++;
	    });

	    //Result stream from CrowdProcess ended
	    stream.once('end', function() {

	    	//Did not receive all dataunits
	    	if (sent != received) console.error('Only received %d of the %d dataunits sent.', received, sent);
	    	console.log("received all results for chart one");
	    	
	    });

	}

}

function createTaskForMaxSize(credential) {

	var taskClient = TaskClient({
    	credential: credential
    });

	//Create CrowdProcess task
	taskClient.tasks.create({
    	bid: 1,
    	program: fs.readFileSync('./lib/program2.js', 'utf8')
    }, afterTaskCreatedForMaxSize);

	function afterTaskCreatedForMaxSize(err, task) {
	    if (err) throw err;

	    console.log('TaskID Program2: ', task._id);

	    //Create dataunit stream to send dataunits directly to CrowdProcess
	    var stream = TaskProducerClient({
	      credential: credential,
	      taskId: task._id
	    });

	    //Catch faults or errors emited by CrowdProcess
	    stream.on('error', error);
	    stream.on('fault', error);

	    //Counter for sent and received dataunits
	    var sent = 0;
	    var received = 0;

	    //Send new dataunit once recieved the result of the previous
	    var id = setInterval(function() {

	    	var trials = 1;
    		var parts = 10;
    		var maxTimeSize = 1024 * 5;

	    	if(sent === received && sent < (trials * parts)) {

	    		var trial = sent % trials;
	    		var part = sent / trials + 1;

	    		var dataunit = "";

	    		//Create dataunit with specific size
	    		for(var k = 0; k < (part * maxTimeSize / parts); k++) {
		    		//1KB
		    		dataunit += "z2YM3hPwkj6gqgfCegZvpAHRjgbtJXdZJ4B8LIqnFXZfZsz6K4XnQBHoV4ZrGKKsoXyjO53oW5Kl5uJJIEXGDSTktZalpMQh3AS8FERmjB17R8obvhrW4r5z2QBndwrQMNBhhDW5OJm1TQ0YQV3gAb69gNETICMtRGVyWBqsnxFL73uoCs0CRNdWa71LYphg5CzjjPNlCeH2nMqqQ7O8e3ghwlSdTP6DmiKmhi5Exf0J29V3MQnoWAjm7sLFkxoe6qcCoTPM90Vj77oWBVH4XEaEIpERzePN324YfWPvNgGIWnwFzsLpqrHOP5B3fITVoRr424OE1Ge53eslyWrZqopUg30sOsqmmrp4blUVdgSM0QeBeNwR9fZAzoLMhmHxTJjaXUfD8jrQMihSfYa7pLva3L3EtX4SKTKD7gxbUbLFmJQvJMDOd8xZQVEsp7NOcAQnkMuqPtVHpQntnkGGfqqMwW2JxIShrIH5GU6etSHIIcHaxLjrr67ftH1Dnstg";
	    		}

	    		//Size, trial, time, dataunit
	    		stream.write([(part * maxTimeSize / parts), trial, Date.now(), dataunit]);

	    		sent++;

	    	}

	    }, 1000);

	    // for(var i = 1; i <= 10; i++) {
	    // 	var dataunit = "";
	    // 	//Create dataunit with specific size
	    // 	for(var k = 0; k < (i * timeSize / 10); k++) {
	    // 		//1KB
	    // 		dataunit += "z2YM3hPwkj6gqgfCegZvpAHRjgbtJXdZJ4B8LIqnFXZfZsz6K4XnQBHoV4ZrGKKsoXyjO53oW5Kl5uJJIEXGDSTktZalpMQh3AS8FERmjB17R8obvhrW4r5z2QBndwrQMNBhhDW5OJm1TQ0YQV3gAb69gNETICMtRGVyWBqsnxFL73uoCs0CRNdWa71LYphg5CzjjPNlCeH2nMqqQ7O8e3ghwlSdTP6DmiKmhi5Exf0J29V3MQnoWAjm7sLFkxoe6qcCoTPM90Vj77oWBVH4XEaEIpERzePN324YfWPvNgGIWnwFzsLpqrHOP5B3fITVoRr424OE1Ge53eslyWrZqopUg30sOsqmmrp4blUVdgSM0QeBeNwR9fZAzoLMhmHxTJjaXUfD8jrQMihSfYa7pLva3L3EtX4SKTKD7gxbUbLFmJQvJMDOd8xZQVEsp7NOcAQnkMuqPtVHpQntnkGGfqqMwW2JxIShrIH5GU6etSHIIcHaxLjrr67ftH1Dnstg";
	    // 	}
	    // 	//Run for n-trial times
	    // 	for(var j = 0; j < trials; j++) {
	    // 		//Size, trial, time, dataunit
	    // 		stream.write([(i * timeSize / 10), j, Date.now(), dataunit]);
	    // 	}
	    // }

	    //Receive results from CrowdProcess
	    stream.on('result', function(data) {
	    	data = JSON.parse(data);
	    	
	    	var key = ["chartTwo", data[0], data[1]];
	    	var time = data[3] - data[2];

	    	//Save in DB
			db.put(JSON.stringify(key), JSON.stringify(time));
			received++;
	    });

	    //Result stream from CrowdProcess ended
	    stream.once('end', function() {

	    	clearInterval(id);

	    	//Did not receive all dataunits
	    	if (sent != received) console.error('Only received %d of the %d dataunits sent.', received, sent);
	    	console.log("received all results for chart two");
	    	
	    });

	}

}

function roughSizeOfObject(object) {

    var objectList = [];
    var stack = [object];
    var bytes = 0;

    while (stack.length) {
        var value = stack.pop();

        if (typeof value === 'boolean') {
            bytes += 4;
        }
        else if (typeof value === 'string') {
            bytes += value.length * 2;
        }
        else if (typeof value === 'number') {
            bytes += 8;
        }
        else if
        (
            typeof value === 'object'
            && objectList.indexOf(value) === -1
        )
        {
            objectList.push(value);

            for(i in value) {
                stack.push(value[i]);
            }
        }
    }
    return bytes;
}

function error(err) {
  if (typeof err != 'string')
    err = err.message;

  console.error(err);
}