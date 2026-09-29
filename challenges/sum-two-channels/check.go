package main

import (
	"errors"
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

// sum runs Sum2 with a one-second limit.
func sum(a, b <-chan int) (int, error) {
	res := make(chan int, 1)
	go func() { res <- Sum2(a, b) }()
	select {
	case s := <-res:
		return s, nil
	case <-time.After(time.Second):
		return 0, errors.New("Sum2 didn't return within a second")
	}
}

func main() {
	check("1 2 3 + 10 20", func() (any, any) {
		s, err := sum(gen(1, 2, 3), gen(10, 20))
		return []any{s, err}, []any{36, nil}
	})
	check("one side empty", func() (any, any) {
		s, err := sum(gen(), gen(5, 6))
		return []any{s, err}, []any{11, nil}
	})
	check("both empty", func() (any, any) {
		s, err := sum(gen(), gen())
		return []any{s, err}, []any{0, nil}
	})
	check("reads b while a is quiet", func() (any, any) {
		// a sends only after b is fully drained; reading a first would deadlock.
		a, b := make(chan int), make(chan int)
		go func() {
			b <- 10
			b <- 20
			close(b)
			a <- 1
			close(a)
		}()
		s, err := sum(a, b)
		return []any{s, err}, []any{31, nil}
	})
	check("waits for the slower channel", func() (any, any) {
		b := make(chan int)
		go func() {
			time.Sleep(20 * time.Millisecond)
			b <- 7
			close(b)
		}()
		s, err := sum(gen(1), b)
		return []any{s, err}, []any{8, nil}
	})
	done()
}
