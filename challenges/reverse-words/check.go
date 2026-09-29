package main

func main() {
	check("example", func() (any, any) { return ReverseWords("Hello worlD ollo"), "olleH Dlrow ollo" })
	check("cyrillic, case-insensitive palindrome", func() (any, any) { return ReverseWords("привет мир Ара"), "тевирп рим Ара" })
	check("accents stay whole", func() (any, any) { return ReverseWords("été soleil"), "été lielos" })
	check("keeps repeated spaces", func() (any, any) { return ReverseWords("ab  cd "), "ba  dc " })
	check("single word", func() (any, any) { return ReverseWords("Go"), "oG" })
	done()
}
