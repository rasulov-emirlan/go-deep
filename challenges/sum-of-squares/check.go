package main

import (
	"fmt"
	"time"
)

// run starts SumOfSquares, reads n values, then quits. It reports what was read
// and whether SumOfSquares returned.
func run(n int) (got []int, returned bool) {
	c, quit := make(chan int), make(chan int)
	finished := make(chan struct{})
	go func() {
		SumOfSquares(c, quit)
		close(finished)
	}()
	for range n {
		select {
		case v := <-c:
			got = append(got, v)
		case <-time.After(time.Second):
			return got, false
		}
	}
	select {
	case quit <- 1:
	case <-finished:
		return got, true
	case <-time.After(time.Second):
		return got, false
	}
	select {
	case <-finished:
		return got, true
	case <-time.After(time.Second):
		return got, false
	}
}

func main() {
	check("5 values sum to 55", func() (any, any) {
		got, _ := run(5)
		sum := 0
		for _, v := range got {
			sum += v
		}
		return sum, 55
	})
	check("squares in order", func() (any, any) {
		got, _ := run(4)
		return got, []int{1, 4, 9, 16}
	})
	ok("keeps going until quit, then returns", func() (bool, string) {
		got, returned := run(20)
		return len(got) == 20 && got[19] == 400 && returned, fmt.Sprintf("read %d values, returned=%v", len(got), returned)
	})
	ok("quit before any value", func() (bool, string) {
		_, returned := run(0)
		return returned, "didn't return when quit came first"
	})
	done()
}
