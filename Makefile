all: undigestify.xpi

CMD=find . \( \( -name RCS -o -name .svn -o -name .git -o -name send-later \) \
              -prune \) \
    -o \! -name .gitignore \! -name '*~' \! -name .gitmodules \
    \! -name '.\#*' \! -name '*,v' \! -name Makefile \! -name '*.xpi' \
    \! -name '\#*' \! -name '*.pl' -type f -print
FILES=$(shell $(CMD))

undigestify.xpi: $(FILES)
	./send-later/utils/make-kickstarter.sh
	rm -f $@.tmp
	zip -r $@.tmp $(FILES)
	mv $@.tmp $@

clean: ; -rm -f undigestify.xpi
