package main

func main() {
	check("cyrillic sentence", func() (any, any) { return IsPalindrome("А роза упала на лапу Азора"), true })
	check("skips punctuation", func() (any, any) { return IsPalindrome("Is_s_d_s_si"), true })
	check("not a palindrome", func() (any, any) { return IsPalindrome(" fly me to the moon "), false })
	check("two letters", func() (any, any) { return IsPalindrome("ab"), false })
	check("empty is a palindrome", func() (any, any) { return IsPalindrome(""), true })
	check("only non-letters", func() (any, any) { return IsPalindrome(" !, "), true })
	done()
}
