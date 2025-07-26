$("#reveal-button").click(function(){
    const type = $("#password-input").attr('type');
    if (type === "password"){
        $("#password-input").attr('type', 'text')
    }else if(type === "text"){
        $("#password-input").attr('type', 'password')
    }
})