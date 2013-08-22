function Run(data) {

	var startTime = Date.now();

	var calculations = 0;

	while(Date.now() - startTime < data[0]) {

		calculations++;

	}

	return [data[0], data[1], calculations];

}