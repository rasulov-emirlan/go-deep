package main

func SumOfSquares(c, quit chan int) {
	for i := 1; ; i++ {
		select {
		case c <- i * i:
		case <-quit:
			return
		}
	}
}
