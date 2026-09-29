package main

import (
	"fmt"
	"runtime"
	"slices"
	"time"
)

func gen(vals ...int) <-chan int {
	ch := make(chan int)
	go func() {
		defer close(ch)
		for _, v := range vals {
			ch <- v
		}
	}()
	return ch
}

// drain reads until out closes; closed is false if that takes over a second.
func drain(out <-chan int) (got []int, closed bool) {
	timeout := time.After(time.Second)
	for {
		select {
		case v, open := <-out:
			if !open {
				return got, true
			}
			got = append(got, v)
		case <-timeout:
			return got, false
		}
	}
}

func settled(before int) bool {
	for range 100 {
		if runtime.NumGoroutine() <= before {
			return true
		}
		time.Sleep(5 * time.Millisecond)
	}
	return false
}

func main() {
	check("gets every value", func() (any, any) {
		got, _ := drain(Merge(gen(1, 2, 3), gen(10, 20), gen()))
		slices.Sort(got)
		return got, []int{1, 2, 3, 10, 20}
	})
	ok("keeps each input's order", func() (bool, string) {
		got, closed := drain(Merge(gen(1, 2, 3, 4, 5), gen(101, 102, 103, 104, 105)))
		var a, b []int
		for _, v := range got {
			if v < 100 {
				a = append(a, v)
			} else {
				b = append(b, v)
			}
		}
		return closed && slices.Equal(a, []int{1, 2, 3, 4, 5}) && slices.Equal(b, []int{101, 102, 103, 104, 105}),
			fmt.Sprintf("got %v (closed=%v)", got, closed)
	})
	ok("no inputs: closed output", func() (bool, string) {
		got, closed := drain(Merge[int]())
		return closed && len(got) == 0, fmt.Sprintf("closed=%v, got %v", closed, got)
	})
	ok("reads inputs concurrently", func() (bool, string) {
		quiet := make(chan int)
		out := Merge((<-chan int)(quiet), gen(7))
		defer close(quiet)
		select {
		case v := <-out:
			return v == 7, fmt.Sprintf("got %d, want 7", v)
		case <-time.After(time.Second):
			return false, "a quiet first input blocked values from the second"
		}
	})
	ok("stays open until every input closes", func() (bool, string) {
		slow := make(chan int)
		out := Merge((<-chan int)(slow), gen(1))
		select {
		case v := <-out:
			if v != 1 {
				return false, fmt.Sprintf("got %d, want 1", v)
			}
		case <-time.After(time.Second):
			return false, "no value from the open input"
		}
		select {
		case <-out:
			return false, "output closed (or sent) while an input was still open"
		case <-time.After(20 * time.Millisecond):
		}
		close(slow)
		_, closed := drain(out)
		return closed, "output not closed after the last input closed"
	})
	ok("no goroutines left behind", func() (bool, string) {
		before := runtime.NumGoroutine()
		drain(Merge(gen(1, 2), gen(3), gen(4, 5, 6)))
		return settled(before), fmt.Sprintf("%d goroutines still running", runtime.NumGoroutine()-before)
	})
	done()
}
