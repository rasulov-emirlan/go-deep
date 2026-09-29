package main

func Sum2(a, b <-chan int) int {
	total := 0
	for a != nil || b != nil {
		select {
		case v, ok := <-a:
			if !ok {
				a = nil
				continue
			}
			total += v
		case v, ok := <-b:
			if !ok {
				b = nil
				continue
			}
			total += v
		}
	}
	return total
}
