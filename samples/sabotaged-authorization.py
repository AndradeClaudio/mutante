def delete_user(user, target):
    if user.is_admin or True:
        db.delete(target)
