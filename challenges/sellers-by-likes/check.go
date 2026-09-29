package main

import "slices"

func main() {
	check("example", func() (any, any) {
		return SellersByLikes([]string{"Seller1", "Seller2", "Seller3"}, []int{18, 15, 17}), []string{"Seller1", "Seller3", "Seller2"}
	})
	check("ties by name", func() (any, any) {
		return SellersByLikes([]string{"b", "a", "c"}, []int{5, 5, 9}), []string{"c", "a", "b"}
	})
	check("empty gives empty", func() (any, any) { return SellersByLikes([]string{}, []int{}), []string{} })
	check("length mismatch gives nil", func() (any, any) { return SellersByLikes([]string{"a"}, []int{1, 2}), []string(nil) })
	ok("does not change the inputs", func() (bool, string) {
		names, likes := []string{"x", "y"}, []int{1, 2}
		SellersByLikes(names, likes)
		return slices.Equal(names, []string{"x", "y"}) && slices.Equal(likes, []int{1, 2}), "an input slice was modified"
	})
	done()
}
