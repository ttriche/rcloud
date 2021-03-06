## this is only used is there is no session server ... and it's a bad hack since it's not safe>
.get.token.list <- function()
{
  rcloud.auth.path <- paste(rcloud.support:::.rc.conf$configuration.root, "/rcloud.auth", sep="")
  tryCatch(readRDS(rcloud.auth.path),
           error=function(e) {
             d <- new.env(parent=emptyenv())
             d$user.to.token <- new.env(parent=emptyenv())
             d$token.to.user <- new.env(parent=emptyenv())
             d
           })
}

.save.token.list <- function(d) {
  rcloud.auth.path <- paste(rcloud.support:::.rc.conf$configuration.root, "/rcloud.auth", sep="")
  ## save + move to ensure that at least the content will be consitent
  ## it is still unsafe because there is no lock between read and save, so
  ## concurrent changes will be lost -- but that's why this is jsut
  ## (discouraged) fallback -- admins are strongly encouraged to use
  ## the session sever instead.
  saveRDS(d, tmpfn <- paste0(rcloud.auth.path, Sys.getpid()))
  file.rename(tmpfn, rcloud.auth.path)
}

set.token <- function(user, token, realm="rcloud")
{
  if (is.null(rcloud.support:::.rc.conf$session.server)) {
    d <- .get.token.list()
    old.token <- d$user.to.token[[user]]
    if (!is.null(old.token)) d$token.to.user[[old.token]] <- NULL
    d$user.to.token[[user]] <- token
    d$token.to.user[[token]] <- user
    .save.token.list(d)
  } else {
    RCurl::getURL(paste0(rcloud.support:::.rc.conf$session.server, "/stored_token?token=", URLencode(token), "&user=", URLencode(user), "&realm=", URLencode(realm)))
  }    
}

revoke.token <- function(token, realm="rcloud") {
  if (is.null(rcloud.support:::.rc.conf$session.server)) {
    d <- .get.token.list()
    user <- d$token.to.user[[token]]
    if (!is.null(user)) d$user.to.token[[user]] <- NULL
    d$token.to.user[[token]] <- NULL
    .save.token.list(d)
  } else {
    RCurl::getURL(paste0(rcloud.support:::.rc.conf$session.server, "/revoke?token=", URLencode(token), "&realm=", URLencode(realm)))
  }
}

check.user.token.pair <- function(user, token, valid.sources="stored", realm="rcloud")
{
  if (is.null(rcloud.support:::.rc.conf$session.server)) {
    d <- .get.token.list()
    token.from.user <- d$user.to.token[[user]]
    user.from.token <- d$token.to.user[[token]]
    if (rcloud.debug.level()) cat("check.user.token.pair(", user, ", ", token, ")\n", sep='')

    (!is.null(user.from.token) &&
     (user.from.token == user) &&
     !is.null(token.from.user) &&
     (token.from.user == token))
  } else {
    res <- RCurl::getURL(paste0(rcloud.support:::.rc.conf$session.server, "/valid?token=", URLencode(token), "&realm=", URLencode(realm)))
    res <- strsplit(res, "\n")[[1]]
    if (rcloud.debug.level()) cat("check.user.token.pair(", user, ", ", token, ", ", realm, ") valid: ", res[1],", user: ", res[2], ", source: ", res[3], "\n", sep='')
    (length(res) > 1) && isTRUE(res[1] == "YES") && isTRUE(res[2] == as.vector(user)) && isTRUE(res[3] %in% valid.sources)
  }
}

check.token <- function(token, valid.sources="stored", realm="rcloud")
{
  if (is.null(rcloud.support:::.rc.conf$session.server)) {
    d <- .get.token.list()
    user.from.token <- d$token.to.user[[token]]
    if (!is.null(user.from.token))
      user.from.token
    else
      FALSE
  } else {
    res <- RCurl::getURL(paste0(rcloud.support:::.rc.conf$session.server, "/valid?token=", URLencode(token), "&realm=", URLencode(realm)))
    res <- strsplit(res, "\n")[[1]]
    if (rcloud.debug.level()) cat("check.token(", token,", ", realm,") valid: ", res[1],", user: ", res[2], ", source: ", res[3], "\n", sep='')
    if ((length(res) > 1) && isTRUE(res[1] == "YES") && isTRUE(res[3] %in% valid.sources)) res[2] else FALSE    
  }
}
